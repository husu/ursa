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

function Router(AV, express, options) {

    var secretKey = options.secretKey || "";

    var Config = require("./config/Config.json");
    var ErrorCode = require("./config/ErrorCode.json");

    var crypto = require('crypto');
    var objectAssign = require('object-assign');

    var packageJson = require('./package.json');

    var LeanCloudStatsAPI = "https://api.leancloud.cn/1.1/stats/";

    this.create = function () {

        var router = express.Router();

        router.get('/', function (req, res) {
            res.send(new Date().getTime() + '');
        });

        router.get("/version", function (req, res) {
            res.send(packageJson.version);
        });

        router.get("/version/:city", function (req, res) {
            var city = req.params.city;
            var url = Config.cities[city].url;

            if (!url) {
                return res.send(ErrorCode.CITY_NOT_FOUND)
            }

            AV.Cloud.httpRequest({
                method: 'GET',
                url: url + Config.statContext + "/version",
                headers: {
                    'Content-Type': 'text/plain'
                }
            }).then(function (response) {
                res.send(response.text);
            }).fail(function (e) {
                res.error("未知版本");
            });
        });

        router.get("/cities", checkLogin);
        router.get("/cities", function (req, res) {
            res.send(Config.cities);
        });

        router.get("/:city", checkLogin);
        router.get("/:city", function (req, res) {
            var city = req.params.city;
            var url = Config.cities[city].url;

            if (!url) {
                return res.send(ErrorCode.CITY_NOT_FOUND)
            }

            var metrics;
            if (req.query.metrics instanceof Array) {
                metrics = req.query.metrics.join(",");
            } else {
                metrics = req.query.metrics;
            }

            var params = {
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
                url: url + Config.statContext,
                headers: {
                    'Content-Type': 'application/json'
                }
            }).then(function (timestamp) {
                var data = {
                    data: JSON.stringify(params),
                    timestamp: timestamp,
                    sign: ""
                };

                data.sign = crypto.createHmac('md5', data.timestamp + secretKey).update(data.data).digest('hex');

                return AV.Cloud.httpRequest({
                    method: 'POST',
                    url: url + Config.statContext,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: data
                });
            }).then(function (response) {
                res.type('json').send(response.text);
            }).fail(function (error) {
                res.send(objectAssign(ErrorCode.STATS_QUERY_FAILED, {internalError: error.data}));
            });

        });

        router.post("/", function (req, res) {
            var data = req.body;
            if (parseInt((data.timestamp - new Date().getTime()) / 60000)) {
                return res.sendStatus(400);
            }

            var sign = crypto.createHmac('md5', data.timestamp + secretKey).update(data.data).digest('hex');

            if (data.sign !== sign) {
                return res.sendStatus(400);
            }

            var params = JSON.parse(data.data);

            if (params.type === 'appmetrics' || params.type === 'rtmetrics') {
                if (params.query.platform) {
                    AV.Cloud.httpRequest({
                        method: 'GET',
                        url: LeanCloudStatsAPI + params.type,
                        params: params.query,
                        headers: {
                            'Content-Type': 'application/json',
                            'X-LC-Id': process.env.LC_APP_ID,
                            'X-LC-Key': process.env.LC_APP_MASTER_KEY + ",master"
                        }
                    }).then(function (response) {
                        res.type('json').send(response.text);
                    }).fail(function (error) {
                        res.status(500).send(error.data);
                    });
                } else {

                    AV.Promise.when(
                        AV.Cloud.httpRequest({
                            method: 'GET',
                            url: LeanCloudStatsAPI + params.type,
                            params: objectAssign(params.query, {platform: "ios"}),
                            headers: {
                                'Content-Type': 'application/json',
                                'X-LC-Id': process.env.LC_APP_ID,
                                'X-LC-Key': process.env.LC_APP_MASTER_KEY + ",master"
                            }
                        }),
                        AV.Cloud.httpRequest({
                            method: 'GET',
                            url: LeanCloudStatsAPI + params.type,
                            params: objectAssign(params.query, {platform: "android"}),
                            headers: {
                                'Content-Type': 'application/json',
                                'X-LC-Id': process.env.LC_APP_ID,
                                'X-LC-Key': process.env.LC_APP_MASTER_KEY + ",master"
                            }
                        })
                    ).then(function (a, b) {
                        a = JSON.parse(a.text);
                        b = JSON.parse(b.text);

                        if (a instanceof Array) {
                            var d = {};
                            a.forEach(function (item) {
                                d[item.metrics] = sumAIntoB(item.data, d[item.metrics]);
                            });
                            b.forEach(function (item) {
                                d[item.metrics] = sumAIntoB(item.data, d[item.metrics]);
                            });


                            var da = [];
                            for (var p in d) {
                                if (!d.hasOwnProperty(p)) {
                                    continue;
                                }
                                da.push({data: d[p], metrics: p});
                            }

                            return da;
                        } else {
                            return {data: sumAIntoB(a.data, b.data), metrics: a.metrics};
                        }
                    }).then(function (data) {
                        res.type('json').send(data);
                    });
                }

            } else {
                res.sendStatus(400).send(ErrorCode.QUERY_TYPE_NOT_SUPPORTED);
            }
        });

        function sumAIntoB(a, b) {
            b = objectAssign(b || {}, {});

            for (var p in a) {
                if (!a.hasOwnProperty(p)) {
                    continue;
                }
                b[p] = (b[p] || 0) + a[p];
            }

            return b;
        }

        function checkLogin(req, res, next) {
            if (req.session.user) {
                next();
            } else {
                res.send(ErrorCode.NOT_LOGIN);
            }
        }

        return router;
    }
}

module.exports = Router;


