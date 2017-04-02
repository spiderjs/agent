import os = require('os');
import path = require('path');
import logger = require('log4js');
import agent = require('./agent');
import server = require('./server');
import child_process = require('child_process');
import collections = require('typescript-collections');
import fq = require('./fq');


const cwd = path.join(__dirname, '..');
const workerjs = path.join(__dirname, 'worker.js');
const log = logger.getLogger('spider-agent-executor');

interface IWorker {
    id: number;
    process: child_process.ChildProcess;
    sleep?: boolean;
}

export class Executor {

    private workers = new Map<number, IWorker>();
    /** The pending job */
    private fifo: fq.IQueue;

    private deployed: number = 0;

    constructor(private config: agent.IExecutor, private server: server.Server) {

        if (!this.config.concurrent || this.config.concurrent === 0) {
            this.config.concurrent = os.cpus().length;
        }

        this.fifo = new fq.LevelQueue(`${this.config.oid}.db`);
    }

    public run() {
        log.debug(JSON.stringify(this.config));
        const concurrent = this.config.concurrent as number;
        for (let i = 0; i < concurrent; i++) {
            log.debug(`start executor[${this.config.oid}] worker(${i}) ...`);
            const child = child_process.fork(workerjs, undefined, { cwd });
            log.debug(`start executor[${this.config.oid}] worker(${i}) -- success`);
            const worker = { id: i, process: child };

            this.workers.set(i, worker);

            this.initWorker(worker);
        }
    }

    public stop(): void {

        this.fifo.removeall().subscribe((job) => {
            job.result = {
                code: 'CANCELED',
                errmsg: `executor[${this.config.oid}] undeployed`,
            };

            this.server.onJobCompleted(job);
        }, (error) => {
            log.error(error);
        });

        for (const worker of this.workers.values()) {
            log.debug(`stop executor[${this.config.oid}] worker[${worker.id}] `);
            const sendevent: agent.IWorkerEvent = { event: 'UNDEPLOY' };
            worker.process.send(sendevent);
        }
    }

    public runJob(job: agent.IJob): void {
        for (const worker of this.workers.values()) {
            if (worker.sleep === true) {
                log.debug(`send job[${job.oid}] to executor[${this.config.oid}] worker[${worker.id}] `);
                const sendevent: agent.IWorkerEvent = { event: 'RUN_JOB', evtarg: job };

                worker.process.send(sendevent);

                this.server.onJobPrepared(job);

                worker.sleep = false;

                return;
            }
        }

        this.fifo.push(job).subscribe(() => {
            log.debug(`enqueue job[${job.oid}]`);
            this.server.onJobPrepared(job);
        }, (error) => {

            job.result = {
                code: 'INNER_ERROR',
                errmsg: error.toString(),
            };

            this.server.onJobCompleted(job);
        });
    }

    private initWorker(worker: IWorker): void {
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

        worker.process.on('message', (event: agent.IWorkerEvent) => {
            log.debug(`recv worker event[${event.event}]`);
            try {
                this.onWorkEvent(worker, event);
            } catch (error) {
                log.error(`process worker event[${event.event}] -- failed\n${error.stack}`);
            }
        });
    }

    private onWorkEvent(worker: IWorker, event: agent.IWorkerEvent): void {
        switch (event.event) {
            case 'STARTED': {
                const sendevent: agent.IWorkerEvent = { event: 'INIT', evtarg: this.config };
                worker.process.send(sendevent);
                break;
            }

            case 'INIT_SUCCESS': {

                this.fifo.pop().map((job) => {
                    const sendevent: agent.IWorkerEvent = { event: 'RUN_JOB', evtarg: job };

                    worker.process.send(sendevent);

                    return job;
                }).count().subscribe((num) => {
                    if (num === 0) {
                        worker.sleep = true;
                    }
                }, (error) => {
                    worker.sleep = true;
                    log.error(error);
                });

                log.info(`executor[${this.config.oid}] worker[${worker.id}] started`);

                this.deployed++;

                if (this.deployed === this.config.concurrent) {
                    this.server.onDeployCompleted(this.config.oid, { code: 'SUCCESS' });
                }

                break;
            }

            case 'JOB_RUNNING': {
                const job = event.evtarg as agent.IJob;

                log.debug(`executor[${this.config.oid}] worker[${worker.id}] start job[${job.oid}]`);

                this.server.onJobRunning(job);

                break;
            }

            case 'JOB_COMPLETED': {
                const job = event.evtarg as agent.IJob;

                log.debug(`executor[${this.config.oid}] worker[${worker.id}] completed job[${job.oid}]`);

                this.fifo.pop().map((job) => {
                    const sendevent: agent.IWorkerEvent = { event: 'RUN_JOB', evtarg: job };

                    worker.process.send(sendevent);

                    return job;
                }).count().subscribe((num) => {
                    if (num === 0) {
                        worker.sleep = true;
                    }
                }, (error) => {
                    worker.sleep = true;
                    log.error(error);
                });

                this.server.onJobCompleted(job);

                break;
            }

            case 'INIT_FAILED': {
                const result = event.evtarg as agent.IResult;
                log.error(`executor[${this.config.oid}] worker[${worker.id}] init -- failed ${result.code}`);

                this.workers.delete(worker.id);

                if (this.workers.size === 0) {
                    this.server.onDeployCompleted(this.config.oid, result);
                }

                break;
            }

            case 'DATA': {
                const result = event.evtarg as agent.IData;

                // tslint:disable-next-line:max-line-length
                log.debug(`executor[${this.config.oid}] worker[${worker.id}] handled job[${result.job}] data`);

                this.server.onData(this.config, result);

                break;
            }

            case 'RUN_JOB': {
                const result = event.evtarg as agent.IJob;

                // tslint:disable-next-line:max-line-length
                log.debug(`executor[${this.config.oid}] worker[${worker.id}] handled run job command \n${JSON.stringify(result.args)}`);

                this.server.onRunJob(result);

                break;
            }

            case 'JOB_PROCESS': {
                const result = event.evtarg as agent.IProcess;

                // tslint:disable-next-line:max-line-length
                log.debug(`executor[${this.config.oid}] worker[${worker.id}] handled run job process \n${JSON.stringify(result)}`);

                this.server.onJobProcess(result);

                break;
            }

            default:
                log.error(`unknown event[${event.event}] from executor[${this.config.oid}] worker[${worker.id}]`);
        }
    }
}
