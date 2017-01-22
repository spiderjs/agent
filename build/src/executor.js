"use strict";
const os = require("os");
const path = require("path");
const logger = require("log4js");
const child_process = require("child_process");
const collections = require("typescript-collections");
const cwd = path.join(__dirname, '..');
const workerjs = path.join(__dirname, 'worker.js');
const log = logger.getLogger('spider-agent-executor');
class Executor {
    constructor(config, server) {
        this.config = config;
        this.server = server;
        this.workers = new Map();
        /** The pending job */
        this.fifo = new collections.Queue();
        this.deployed = 0;
        this.config.concurrent = this.config.concurrent ? this.config.concurrent : os.cpus().length;
    }
    run() {
        log.debug(JSON.stringify(this.config));
        for (let i = 0; i < this.config.concurrent; i++) {
            log.debug(`start executor[${this.config.oid}] worker(${i}) ...`);
            const child = child_process.fork(workerjs, undefined, { cwd });
            log.debug(`start executor[${this.config.oid}] worker(${i}) -- success`);
            const worker = { id: i, process: child };
            this.workers.set(i, worker);
            this.initWorker(worker);
        }
    }
    stop() {
        this.fifo.forEach((job) => {
            job.result = {
                code: 'CANCELED',
                errmsg: `executor[${this.config.oid}] undeployed`,
            };
            this.server.onJobCompleted(job);
        });
    }
    runJob(job) {
        for (const worker of this.workers.values()) {
            if (worker.sleep === true) {
                log.debug(`send job[${job.oid}] to executor[${this.config.oid}] worker[${worker.id}] `);
                const sendevent = { event: 'RUN_JOB', evtarg: job };
                worker.process.send(sendevent);
            }
        }
        log.debug(`enqueue job[${job.oid}]`);
        this.fifo.enqueue(job);
    }
    initWorker(worker) {
        worker.process.on('exit', (code, signal) => {
            log.debug(`executor[${this.config.oid}] worker[${worker.id}] exit with code ${code} : ${signal}`);
            this.workers.delete(worker.id);
            if (this.workers.size === 0) {
                this.server.onUndeployCompleted(this.config.oid, { code: 'SUCCESS' });
            }
        });
        worker.process.on('error', (error) => {
            log.error(`executor[${this.config.oid}] worker[${worker.id}] raise error :${error}`);
        });
        worker.process.on('message', (event) => {
            log.debug(`recv worker event[${event.event}]`);
            try {
                this.onWorkEvent(worker, event);
            }
            catch (error) {
                log.error(`process worker event[${event.event}] -- failed\n${error.stack}`);
            }
        });
    }
    onWorkEvent(worker, event) {
        switch (event.event) {
            case 'STARTED': {
                const sendevent = { event: 'INIT', evtarg: this.config };
                worker.process.send(sendevent);
                break;
            }
            case 'INIT_SUCCESS': {
                if (this.fifo.size() === 0) {
                    worker.sleep = true;
                }
                else {
                    const sendevent = { event: 'RUN_JOB', evtarg: this.fifo.dequeue() };
                    worker.process.send(sendevent);
                }
                log.info(`executor[${this.config.oid}] worker[${worker.id}] started`);
                this.deployed++;
                if (this.deployed === this.config.concurrent) {
                    this.server.onDeployCompleted(this.config.oid, { code: 'SUCCESS' });
                }
                break;
            }
            case 'JOB_COMPLETED': {
                const job = event.evtarg;
                log.debug(`executor[${this.config.oid}] worker[${worker.id}] completed job[${job.oid}]`);
                if (this.fifo.size() === 0) {
                    worker.sleep = true;
                }
                else {
                    const sendevent = { event: 'RUN_JOB', evtarg: this.fifo.dequeue() };
                    worker.process.send(sendevent);
                }
                this.server.onJobCompleted(job);
                break;
            }
            case 'INIT_FAILED': {
                const result = event.evtarg;
                log.error(`executor[${this.config.oid}] worker[${worker.id}] init -- failed ${result.code}`);
                this.workers.delete(worker.id);
                if (this.workers.size === 0) {
                    this.server.onUndeployCompleted(this.config.oid, { code: 'SUCCESS' });
                }
                break;
            }
            default:
                log.error(`unknown event[${event.event}] from executor[${this.config.oid}] worker[${worker.id}]`);
        }
    }
}
exports.Executor = Executor;
//# sourceMappingURL=executor.js.map