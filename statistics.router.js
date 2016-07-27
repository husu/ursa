/**
 * Created by Diluka on 2016-03-31.
 *
 *
 * ----------- 神 兽 佑 我 -----------
 *        ┏┓      ┏┓+ +
 *       ┏┛┻━━━━━━┛┻┓ + +
 *       ┃          ┃ 　
 *       ┣     ━    ┃ ++ + + +
 *      ████━████   ┃+
 *       ┃          ┃ +
 *       ┃  ┴       ┃
 *       ┃          ┃ + +
 *       ┗━┓      ┏━┛  Code is far away from bug
 *         ┃      ┃       with the animal protecting
 *         ┃      ┃ + + + +
 *         ┃      ┃　              　
 *         ┃      ┃ +
 *         ┃      ┃      +  +
 *         ┃      ┃　　+
 *         ┃      ┗━━━┓ + +
 *         ┃          ┣┓
 *         ┃          ┏┛
 *         ┗┓┓┏━━━━┳┓┏┛ + + + +
 *          ┃┫┫  　┃┫┫
 *          ┗┻┛　  ┗┻┛+ + + +
 * ----------- 永 无 BUG ------------
 */
"use strict";
const AV = require("leanengine");
const express = require("express");
const _ = require("lodash");
const moment = require("moment");

const crypto = require('crypto');
const ErrorCode = require("./config/ErrorCode.json");

const router = express.Router();

const LeanCloudStatsAPI = "https://api.leancloud.cn/1.1/stats/";
const config = global.config.ursa;

router.get('/', (req, res) => res.send(new Date().getTime() + ''));

router.get("/version", (req, res) => res.send(config.version));

router.get("/version/:city", (req, res) => {
    let city = req.params.city;
    let url = config.cities[city].url;

    if (!url) {
        return res.send(ErrorCode.CITY_NOT_FOUND)
    }

    AV.Cloud.httpRequest({
        method: 'GET',
        url: url + config.context + "/version",
        headers: {
            'Content-Type': 'text/plain'
        }
    })
        .then(response => res.send(response.text))
        .fail(e => res.status(500).send("未知版本"));
});

router.get("/cities", checkLogin);
router.get("/cities", (req, res) => res.send(config.cities));

router.get("/:city", checkLogin);
router.get("/:city", (req, res) => {
    let city = req.params.city;
    let url = config.cities[city].url;

    if (!url) {
        return res.send(ErrorCode.CITY_NOT_FOUND)
    }

    let metrics = _.isArray(req.query.metrics)
        ? req.query.metrics.join(",") : req.query.metrics;

    let params = {
        type: req.query.type,
        query: {
            platform: req.query.platform,
            metrics: metrics,
            start: req.query.start,
            end: req.query.end,
            appversion: req.query.appversion,
            channel: req.query.channel,
            event: req.query.event,
            event_label: req.query.event_label
        }
    };

    AV.Cloud.httpRequest({
        method: 'GET',
        url: url + config.context,
        headers: {
            'Content-Type': 'application/json'
        }
    }).then(function (timestamp) {
        var data = {
            data: JSON.stringify(params),
            timestamp: timestamp,
            sign: ""
        };

        data.sign = crypto.createHmac('md5', data.timestamp + config.secretKey).update(data.data).digest('hex');

        return AV.Cloud.httpRequest({
            method: 'POST',
            url: url + config.context,
            headers: {
                'Content-Type': 'application/json'
            },
            body: data
        });
    }).then(function (response) {
        res.type('json').send(response.text);
    }).fail(function (error) {
        console.log("ursa", error.text);
        res.send(_.extend({}, ErrorCode.STATS_QUERY_FAILED, { internalError: error.text }));
    });

});

function getStatisticsData(params) {
    switch (params.type) {
        case "appmetrics":
        case "rtmetrics":
            return getStatisticsDataFromLC(params);
        case "db":
            return getStatisticsDataFromDB(params);
        default:
            return AV.Promise.error(ErrorCode.QUERY_TYPE_NOT_SUPPORTED);
    }
}

function getStatisticsDataFromDB(params) {
    let func = dbQuery[params.query.metrics];
    if (_.isFunction(func)) {
        return func(params);
    } else {
        return AV.Promise.error(ErrorCode.QUERY_TYPE_NOT_SUPPORTED);
    }
}

const dbQuery = {
    "registers": function (params) {

        let start = params.query.start ? moment(params.query.start, "YYYYMMDD") : moment();
        let end = params.query.end ? moment(params.query.end, "YYYYMMDD") : moment();

        let dates = [];
        let ps = [];


        for (; end.isSameOrAfter(start,"day"); start.add(1, "day")) {
            let s = start.clone().startOf("day").toDate();
            let e = start.clone().endOf("day").toDate();

            dates.push(moment(s).format("YYYY-MM-DD"));

            let p = new AV.Query(AV.User).equalTo("userType", 1).greaterThan("createdAt", s).lessThan("createdAt", e).count();

            ps.push(p);
        }

        return AV.Promise.all(ps).then(counts => _.zipObject(dates, counts)).then(data => {
            return {
                data: data,
                metrics: "registers"
            }
        });
    }
};

function requestLC(params, platform) {
    return AV.Cloud.httpRequest({
        method: 'GET',
        url: LeanCloudStatsAPI + params.type,
        params: _.extend({}, params.query, { platform: platform }),
        headers: {
            'Content-Type': 'application/json',
            'X-LC-Id': process.env.LC_APP_ID,
            'X-LC-Key': process.env.LC_APP_MASTER_KEY + ",master"
        }
    }).then(res => res.data).then(o => _.isArray(o) ? o : [o]).then(o => _.keyBy(o, "metrics"));
}

function getStatisticsDataFromLC(params) {
    if (params.query.platform) {
        return AV.Cloud.httpRequest({
            method: 'GET',
            url: LeanCloudStatsAPI + params.type,
            params: params.query,
            headers: {
                'Content-Type': 'application/json',
                'X-LC-Id': process.env.LC_APP_ID,
                'X-LC-Key': process.env.LC_APP_MASTER_KEY + ",master"
            }
        }).then(res => res.data).fail(e => e.data);
    } else {

        return AV.Promise.when(
            requestLC(params, "ios"),
            requestLC(params, "android")
        ).then(function (a, b) {
            return _.chain(_.union(_.keys(a), _.keys(b))).reduce((accelerator, metric) => {
                let ma = _.result(a, `${metric}.data`, {});
                let mb = _.result(b, `${metric}.data`, {});

                accelerator[metric] = _.reduce(_.union(_.keys(ma), _.keys(mb)), (data, key) => {
                    data[key] = _.result(ma, key, 0) + _.result(mb, key, 0);
                    return data;
                }, {});

                return accelerator;
            }, {}).map((v, k) => {
                return {
                    data: v,
                    metrics: k
                };
            }).thru(list => _.size(list) === 1 ? list[0] : list).value();
        });
    }
}

router.post("/", function (req, res) {
    let data = req.body;
    if (parseInt((data.timestamp - new Date().getTime()) / 60000)) {
        return res.sendStatus(400);
    }

    let sign = crypto.createHmac('md5', data.timestamp + config.secretKey).update(data.data).digest('hex');

    if (data.sign !== sign) {
        return res.sendStatus(400);
    }

    getStatisticsData(JSON.parse(data.data))
        .then(data => res.type("json").send(data))
        .fail(e => res.status(500).send(e));

});

function checkLogin(req, res, next) {
    if (req.AV.user) {
        next();
    } else {
        res.send(ErrorCode.NOT_LOGIN);
    }
}

module.exports = router;


