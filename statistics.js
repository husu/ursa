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

    var LeanCloudStatsAPI = "https://api.leancloud.cn/1.1/stats/";

    this.create = function () {

        var router = express.Router();

        router.get('/', function (req, res) {
            res.send(new Date().getTime() + '');
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
                    event: req.query.event
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
                    var p1 = params.query;
                    var p2 = params.query;

                    p1.platform = "iOS";
                    p2.platform = "android";

                    AV.Promise.when(
                        AV.Cloud.httpRequest({
                            method: 'GET',
                            url: LeanCloudStatsAPI + params.type,
                            params: p1,
                            headers: {
                                'Content-Type': 'application/json',
                                'X-LC-Id': process.env.LC_APP_ID,
                                'X-LC-Key': process.env.LC_APP_MASTER_KEY + ",master"
                            }
                        }),
                        AV.Cloud.httpRequest({
                            method: 'GET',
                            url: LeanCloudStatsAPI + params.type,
                            params: p2,
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
                            for (var p in a.data) {
                                if (!a.data.hasOwnProperty(p)) {
                                    continue;
                                }
                                b.data[p] = (b.data[p] || 0) + a.data[p];
                            }

                            return b;
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
            if (b) {
                for (var p in a) {
                    if (!a.hasOwnProperty(p)) {
                        continue;
                    }
                    b[p] = (b[p] || 0) + a[p];
                }
            } else {
                b = a;
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


