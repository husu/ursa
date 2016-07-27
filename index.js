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
const _ = require("lodash");
const config = require("./config/Config.json");
const packageJson = require("./package.json");

exports.Ursa = {
    load: (options) => {
        options = _.extend({
            // AV: global.AV || require("leanengine"),
            // express: global.express || require("express"),
            app: global.app,
            secretKey: "",
            context: config.statContext
        }, options);

        // global.app = options.app || options.express();
        global.config = _.extend({}, global.config, {
            "ursa": {
                secretKey: options.secretKey,
                context: options.context,
                version: packageJson.version,
                cities: config.cities
            }
        });

        const app = options.app;

        app.use(options.context, require("./statistics.router"));

    },
    ErrorCode: require("./config/ErrorCode.json")
};
