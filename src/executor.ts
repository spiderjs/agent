import os = require('os');
import path = require('path');
import logger = require('log4js');
import agent = require('./agent');
import server = require('./server');
import child_process = require('child_process');
import collections = require('typescript-collections');
import fq = require('./fq');
import rx = require('rx');
import cs = require('typescript-collections');
import request = require('request');
import config = require('config');
const cwd = path.join(__dirname, '..');
const workerjs = path.join(__dirname, 'worker.js');
const log = logger.getLogger('spider-agent-executor');
const workerlog = logger.getLogger('spider-agent-worker');

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

    private stopped = false;

    private proxies = new cs.Queue<agent.IProxy>();

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
            this.createWork(i);
        }
    }

    public stop(): void {

        this.stopped = true;

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
            log.debug(`stop executor[${this.config.oid}] worker[${worker.process.pid}] `);
            const sendevent: agent.IWorkerEvent = { event: 'UNDEPLOY' };
            worker.process.send(sendevent);
        }

        this.fifo.disponse();
    }

    public runJob(job: agent.IJob): void {

        log.debug(`run job ${job.oid}`);

        this.fifo.push(job).subscribe(() => {
            log.debug(`enqueue job[${job.oid}] ${this.fifo.size()}`);
            this.server.onJobPrepared(job);
            this.doRunJob();
        }, (error) => {

            job.result = {
                code: 'INNER_ERROR',
                errmsg: error.toString(),
            };

            this.server.onJobCompleted(job);
        });
    }

    private doRunJob() {

        for (const worker of this.workers.values()) {
            if (worker.sleep === true) {
                worker.sleep = false;
                this.fifo.pop().map((newjob) => {
                    // tslint:disable-next-line:max-line-length
                    log.debug(`executor[${this.config.oid}] worker[${worker.process.pid},${this.fifo.size()}]  start job(${newjob.oid}) `);
                    const sendevent: agent.IWorkerEvent = { event: 'RUN_JOB', evtarg: newjob };
                    worker.process.send(sendevent);

                }).count().subscribe((num) => {
                    if (num === 0) {
                        // tslint:disable-next-line:max-line-length
                        log.debug(`executor[${this.config.oid}] worker[${worker.process.pid},${this.fifo.size()}] -- sleep`);
                        worker.sleep = true;
                    }
                }, (error) => {
                    worker.sleep = true;
                    log.error(error);
                });

                return;
            }
        }
    }

    private initWorker(worker: IWorker): void {
        worker.process.on('exit', (code, signal) => {
            log.debug(`executor[${this.config.oid}] worker[${worker.process.pid}] exit with code ${code} : ${signal}`);

            this.workers.delete(worker.id);

            if (this.workers.size === 0) {
                this.server.onUndeployCompleted(this.config.oid, { code: 'SUCCESS' });
            }

            if (!this.stopped) {
                log.debug(`try restart executor[${this.config.oid}] worker[${worker.process.pid}] ...`);
                this.createWork(worker.id);
            }
        });

        worker.process.on('error', (error) => {
            log.error(`executor[${this.config.oid}] worker[${worker.process.pid}] raise error :${error}`);
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

                log.debug(`worker(${worker.process.pid}) -- init success`);

                this.fifo.pop().map((newjob) => {
                    // tslint:disable-next-line:max-line-length
                    log.debug(`executor[${this.config.oid}] worker[${worker.process.pid},${this.fifo.size()}]  start job(${newjob.oid}) `);

                    const sendevent: agent.IWorkerEvent = { event: 'RUN_JOB', evtarg: newjob };

                    worker.process.send(sendevent);

                    return newjob;
                }).count().subscribe((num) => {
                    log.debug(`worker(${worker.process.pid}) pop: ${num}`);
                    if (num === 0) {
                        worker.sleep = true;
                    }
                }, (error) => {
                    worker.sleep = true;
                    log.error(error);
                });

                log.info(`executor[${this.config.oid}] worker[${worker.process.pid}] started`);

                this.deployed++;

                if (this.deployed === this.config.concurrent) {
                    this.server.onDeployCompleted(this.config.oid, { code: 'SUCCESS' });
                }

                break;
            }

            case 'JOB_RUNNING': {
                const job = event.evtarg as agent.IJob;

                log.debug(`executor[${this.config.oid}] worker[${worker.process.pid}] start job[${job.oid}]`);

                this.server.onJobRunning(job);

                break;
            }

            case 'JOB_COMPLETED': {
                const job = event.evtarg as agent.IJob;

                // tslint:disable-next-line:max-line-length
                log.debug(`executor[${this.config.oid}] worker[${worker.process.pid}] completed job[${job.oid}],pending(${this.fifo.size()})`);

                this.fifo.pop().map((newjob) => {
                    // tslint:disable-next-line:max-line-length
                    log.debug(`executor[${this.config.oid}] worker[${worker.process.pid},${this.fifo.size()}]  start job(${newjob.oid}) `);
                    const sendevent: agent.IWorkerEvent = { event: 'RUN_JOB', evtarg: newjob };

                    worker.process.send(sendevent);

                    return newjob;
                }).count().subscribe((num) => {
                    if (num === 0) {
                        // tslint:disable-next-line:max-line-length
                        log.debug(`executor[${this.config.oid}] worker[${worker.process.pid},${this.fifo.size()}] -- sleep`);
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
                log.error(`executor[${this.config.oid}] worker[${worker.process.pid}] init-- failed ${result.code}`);

                this.workers.delete(worker.id);

                if (this.workers.size === 0) {
                    this.server.onDeployCompleted(this.config.oid, result);
                }

                break;
            }

            case 'DATA': {
                const result = event.evtarg as agent.IData;

                // tslint:disable-next-line:max-line-length
                log.debug(`executor[${this.config.oid}] worker[${worker.process.pid}] handled job[${result.job}] data`);

                this.server.onData(this.config, result);

                break;
            }

            case 'RUN_JOB': {
                const result = event.evtarg as agent.IJob;

                // tslint:disable-next-line:max-line-length
                log.debug(`executor[${this.config.oid}] worker[${worker.process.pid}] handled run job command \n${JSON.stringify(result.args)}`);

                this.server.onRunJob(result);

                break;
            }

            case 'JOB_PROCESS': {
                const result = event.evtarg as agent.IProcess;

                // tslint:disable-next-line:max-line-length
                log.debug(`executor[${this.config.oid}] worker[${worker.process.pid}] handled run job process \n${JSON.stringify(result)}`);

                this.server.onJobProcess(result);

                break;
            }
            case 'PROXY': {
                this.updateProxy(worker, event.evtarg as agent.IProxy);
                break;
            }

            case 'LOG': {
                const result = event.evtarg as agent.ILogEntry;

                switch (result.level) {
                    case 'trace': {
                        workerlog.trace(result.message);
                        break;
                    }
                    case 'debug': {
                        workerlog.debug(result.message);
                        break;
                    }
                    case 'info': {
                        workerlog.info(result.message);
                        break;
                    }
                    case 'warn': {
                        workerlog.warn(result.message);
                        break;
                    }
                    case 'error': {
                        workerlog.error(result.message);
                        break;
                    }
                    case 'fatal': {
                        workerlog.fatal(result.message);
                        break;
                    }
                    default:
                        workerlog.info(result.message);
                }

                break;
            }

            default:
                // tslint:disable-next-line:max-line-length
                log.error(`unknown event[${event.event}] from executor[${this.config.oid}] worker[${worker.process.pid}]`);
        }
    }

    private createWork(num: number): void {
        log.debug(`start executor[${this.config.oid}] worker(${num}) ...`);
        const child = child_process.fork(workerjs, undefined, { cwd });
        log.debug(`start executor[${this.config.oid}] worker(${num})-- success`);
        const worker = { id: num, process: child };

        this.workers.set(num, worker);

        this.initWorker(worker);
    }

    private updateProxy(worker: IWorker, proxy?: agent.IProxy) {
        log.debug(`proxies cached size ${this.proxies.size()}`);
        if (this.proxies.isEmpty()) {
            log.debug(`load proxy from kuaidaili ...`);
            request({
                method: 'GET',
                // tslint:disable-next-line:max-line-length
                uri: config.get<string>('zhandaye.url'),
                // qs: config.get<any>('kuaidaili.request'),
                useQuerystring: true,
            }, (error, response, body) => {
                if (error) {
                    log.error(`GET kuaidaili error`, error);
                    return;
                }

                if (response.statusCode !== 200) {
                    log.error(`GET kuaidaili status code(${response.statusMessage})`);
                    return;
                }

                log.debug(body);

                log.debug(`load proxy from kuaidaili -- success`);

                for (const p of (body as string).split('\r\n')) {
                    log.debug(p);
                    const nodes = p.split(':');
                    this.proxies.enqueue({
                        ip: nodes[0],
                        passwd: config.has('zhandaye.password') ? config.get<string>('zhandaye.password') : undefined,
                        port: nodes[1],
                        type: 'https',
                        user: config.has('zhandaye.user') ? config.get<string>('zhandaye.user') : undefined,
                    });
                }
            });
            return;
        }

        proxy = this.proxies.dequeue();

        log.debug(`pop proxy ${JSON.stringify(proxy)}`);

        const sendevent: agent.IWorkerEvent = { event: 'PROXY', evtarg: proxy };

        worker.process.send(sendevent);
    }
}
