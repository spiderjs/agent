import assert = require('assert');
import logger = require('log4js');
import Server = require('../src/server');
import WatchDog = require('../src/watchdog');

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