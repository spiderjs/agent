const grpc = require('grpc');
const events = require('events');
const logger = require('log4js').getLogger('watchdog');
const proto = require('spiderjs-proto');

function WatchDog(oid, remote) {
    this.emitter = new events.EventEmitter();
    this.oid = oid;
    this.remote = remote ? remote : 'localhost:1714';
    var spiderjs = grpc.load(proto.get('spiderjs.proto')).spiderjs;

    logger.info(`start agent[${this.oid}] ..`);
    logger.info(`connect to watchdog [${this.remote}] ..`);

    this.client = new spiderjs.WatchDog(
        this.remote,
        grpc.credentials.createInsecure());

    logger.info(`start agent[${this.oid}] -- success`);

    this.connect();
}

WatchDog.prototype.on = function (evt, fun) {
    this.emitter.on(evt, fun);
};

WatchDog.prototype.connect = function () {

    this.stream = this.client.online();

    this.stream.write({
        event: 'AGENT_ONLINE',
        oid: this.oid,
    });

    this.stream.on('data', (command) => {

        try {
            this.onCommand(command);
        } catch (error) {
            logger.error(error.stack);
        }

    });

    this.stream.on('status', (status) => {
        logger.debug(`stream status changed :${status.code}`);

        this.stream.cancel();

        this.connect();
    });

    this.stream.on('error', (err) => {
        logger.error(`connection to scheduler error: grpc(${err.code})`);
    });

    this.stream.on('end', () => {
        logger.info('scheduler manual closed connection');
    });
};


WatchDog.prototype.onCommand = function (command) {
    logger.debug(`recv notify :${command.event}`);

    this.emitter.emit(command.event, command[command.evtargs]);
};

WatchDog.prototype.onUpdatePerf = function (perf) {
    this.stream.write({
        event: 'PERF_UPDATE',
        perf: perf,
    });
};

WatchDog.prototype.onUndeployingCompleted = function (oid, result) {
    this.stream.write({
        event: 'EXECTUTOR_UNDEPLOY_COMPLETED',
        oid: oid,
        result: result
    });
};

WatchDog.prototype.onDeployCompleted = function (oid, result) {
    this.stream.write({
        event: 'EXECTUTOR_DEPLOY_COMPLETED',
        oid: oid,
        result: result
    });
};

WatchDog.prototype.onJobCompleted = function (job) {

    this.stream.write({
        event: 'JOB_COMPLETED',
        oid: this.oid,
        job: job
    });

};

WatchDog.prototype.onJobPrepared = function (job) {

    this.stream.write({
        event: 'JOB_PREPARED',
        oid: this.oid,
        job: job
    });

};

WatchDog.prototype.onJobRunning = function (job) {

    this.stream.write({
        event: 'JOB_RUNNING',
        oid: this.oid,
        job: job
    });

};

WatchDog.prototype.onData = function (data) {

    this.stream.write({
        event: 'DATA',
        oid: this.oid,
        data: data
    });

};

WatchDog.prototype.onRunJob = function (job) {
    logger.debug(`run job\n${JSON.stringify(job)}`);
    this.client.runJob(job, (err, response) => {
        if (err) {
            logger.error(err);
        } else {
            if (response.code !== 'SUCCESS') {
                logger.error(response.errmsg);
            } else {
                logger.debug(`run job -- success\n${JSON.stringify(job)}`);
            }
        }
    });
};

module.exports.WatchDog = WatchDog;
