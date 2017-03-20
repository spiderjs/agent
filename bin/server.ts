import path = require('path');
import assert = require('assert');
import logger = require('log4js');
import process = require('process');
import Server = require('../src/server');
import WatchDog = require('../src/watchdog');
import config = require('config');

const log = logger.getLogger('spiderjs-agent');

const configpath = path.join(__dirname, '/../../config/log.json');

log.debug(configpath);

logger.configure(configpath, { reloadSecs: 600 });

const watchdog = new WatchDog.WatchDog(config.get<string>('agent'), config.get<string>('watchdog'));

const server = new Server.Server(config.get<string>('agent'), watchdog);

server.run();
