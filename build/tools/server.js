"use strict";
const logger = require("log4js");
const process = require("process");
const Server = require("../src/server");
const WatchDog = require("../src/watchdog");
const log = logger.getLogger('spiderjs-agent');
const oid = process.env.SPIDERJS_AGENT ? process.env.SPIDERJS_AGENT : 'AG566edd5acc821000';
const watchdog = new WatchDog.WatchDog(oid);
const server = new Server.Server(oid, watchdog);
//# sourceMappingURL=server.js.map