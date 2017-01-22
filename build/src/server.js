"use strict";
const exec = require("./executor");
const assert = require("assert");
const logger = require("log4js");
const log = logger.getLogger('spiderjs-agent');
function pcall(fun) {
    try {
        fun();
        return true;
    }
    catch (error) {
        log.error(error.stack);
        return false;
    }
}
class Server {
    constructor(oid, watchdog) {
        this.perfUpdateInterval = 60000;
        this.executors = new Map();
        assert.ok(oid);
        assert.ok(watchdog);
        this.oid = oid;
        this.watchdog = watchdog;
        // init empty perf
        this.perf = {
            agent: oid,
            executors: [],
            jobs: 0,
            pending: 0,
        };
        this.watchdog.on('DEPLOY_EXECUTOR', (executor) => {
            pcall(() => {
                this.deploy(executor);
            });
        });
        this.watchdog.on('UNDEPLOY_EXECUTOR', (executoroid) => {
            pcall(() => {
                this.undeploy(executoroid);
            });
        });
        this.watchdog.on('ACCEPT_AGENT', () => {
            pcall(() => {
                this.accept();
            });
        });
        this.watchdog.on('REJECT_AGENT', (result) => {
            pcall(() => {
                this.reject(result);
            });
        });
        this.watchdog.on('RUN_JOB', (job) => {
            pcall(() => {
                this.runJob(job);
            });
        });
    }
    run() {
        const self = this;
        setInterval(() => {
            self.updatePerf();
        }, this.perfUpdateInterval);
    }
    onJobCompleted(job) {
        this.perf.pending--;
        this.watchdog.onJobCompleted(job);
    }
    onDeployCompleted(oid, result) {
        this.watchdog.onDeployCompleted(oid, result);
    }
    onUndeployCompleted(oid, result) {
        const executor = this.executors.get(oid);
        if (executor) {
            executor.stop();
            this.executors.delete(oid);
            this.watchdog.onUndeployingCompleted(oid, result);
        }
    }
    updatePerf() {
        this.perf.executors = [];
        // tslint:disable-next-line:forin
        for (const key of this.executors.keys()) {
            this.perf.executors.push(key);
        }
        log.debug(JSON.stringify(this.perf));
        this.watchdog.onUpdatePerf(this.perf);
    }
    accept() {
        log.debug('recv accept event');
    }
    reject(result) {
        log.debug('recv reject event :' + result);
    }
    deploy(config) {
        let executor = this.executors.get(config.oid);
        if (!executor) {
            log.debug(`create new executor[${config.oid}]`);
            executor = new exec.Executor(config, this);
            executor.run();
            this.executors.set(config.oid, executor);
        }
        this.updatePerf();
    }
    undeploy(oid) {
        log.debug(`undeploy executor ${oid}`);
    }
    runJob(job) {
        this.perf.jobs++;
        this.perf.pending++;
        const executor = this.executors.get(job.executor);
        if (!executor) {
            log.error(`can't dispatch job[${job.oid}] to executor[${job.executor}] --- executor not found`);
            job.result = {
                code: 'RESOURCE_NOT_FOUND',
                errmsg: `executor[${job.executor}] not found`,
            };
            this.onJobCompleted(job);
        }
        else {
            executor.runJob(job);
        }
    }
}
exports.Server = Server;
//# sourceMappingURL=server.js.map