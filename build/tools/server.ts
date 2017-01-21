import assert = require('assert');
import logger = require('log4js');
import process = require('process');
import Server = require('../src/server');
import WatchDog = require('../src/watchdog');

const log = logger.getLogger('spiderjs-agent');

const oid = process.env.SPIDERJS_AGENT ? process.env.SPIDERJS_AGENT : 'AG566edd5acc821000';

const watchdog = new WatchDog.WatchDog(oid);

const server = new Server.Server(oid, watchdog);
