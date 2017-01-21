"use strict";
const assert = require("assert");
const logger = require("log4js");
const Server = require("../src/server");
const WatchDog = require("../src/watchdog");
const log = logger.getLogger('spiderjs-agent');
let server;
describe('create server', () => {
    it('', () => {
        const watchdog = new WatchDog.WatchDog('xxx');
        server = new Server.Server('xxxxx', watchdog);
        log.debug(typeof Server);
        assert.ok(server);
    });
});
//# sourceMappingURL=server.js.map