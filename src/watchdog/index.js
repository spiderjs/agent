const path = require('path');
const grpc = require('grpc');
const events = require('events');
const logger = require('log4js').getLogger('watchdog');

function WatchDog(oid, remote) {
    this.emitter = new events.EventEmitter();
    this.oid = oid;
    this.remote = remote ? remote : 'localhost:1714';
    var spiderjs = grpc.load(path.join(__dirname, 'spiderjs.proto')).spiderjs;

    logger.info(`start agent[${this.oid}] ..`);

    this.client = new spiderjs.WatchDog(
        this.remote,
        grpc.credentials.createInsecure());

    logger.info(`start agent[${this.oid}] -- success`);

    this.connect();
}

WatchDog.prototype.on = function(evt, fun) {
    this.emitter.on(evt, fun);
};

WatchDog.prototype.connect = function() {
    const self = this;

    const call = this.client.online();

    this.stream = call;

    call.write({
        event: 'AGENT_ONLINE',
        oid: this.oid,
    });

    call.on('data', (command) => {
        self.onCommand(command);
    });

    call.on('error', (err) => {
        logger.error(`connection to scheduler error: grpc(${err.code})`);

        if (err.code == 14 && !self.reconnect) {
            self.connect();
        }

        self.reconnect = false;
    });

    call.on('end', () => {
        logger.info('scheduler manual closed connection');
        self.reconnect = true;
        self.connect();
    });
};


WatchDog.prototype.onCommand = function(command) {
    logger.debug(`recv notify :${command.event}`);

    this.emitter.emit(command.event, command[command.evtargs]);
};

WatchDog.prototype.onUpdatePerf = function(perf) {
    this.stream.write({
        event: 'PERF_UPDATE',
        perf: perf,
    });
};

module.exports.WatchDog = WatchDog;