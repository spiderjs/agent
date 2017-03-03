import assert = require('assert');
import logger = require('log4js');
import process = require('process');
import Server = require('../src/server');
import WatchDog = require('../src/watchdog');

const log = logger.getLogger('spiderjs-agent');

const oid = process.env.SPIDERJS_AGENT ? process.env.SPIDERJS_AGENT : 'AG5696dc7922c00000';
const url = process.env.SPIDERJS_WATCHDOG_URL ? process.env.SPIDERJS_WATCHDOG_URL : 'localhost:1714';
const watchdog = new WatchDog.WatchDog(oid, url);

const server = new Server.Server(oid, watchdog);

server.run();
