import fs = require('fs');
import path = require('path');
import agent = require('./agent');
import process = require('process');
import vm = require('vm');
import Horseman = require('./horseman');
import util = require('util');
import config = require('config');
import logger = require('./workerlog');

const log = new logger.WorkerLog('worker');

class Worker {
    private config: agent.IExecutor;
    private script: vm.Script;
    private horseman: Horseman.Horseman;
    private proxy: agent.IProxy;
    private userAgents: string[];
    constructor() {
        const userAgentFile = path.join(process.cwd(), 'config/userAgent.json');

        this.userAgents = JSON.parse(fs.readFileSync(userAgentFile, 'UTF-8'));
    }

    public run(): void {
        process.on('message', (event: agent.IWorkerEvent) => {
            try {
                this.onEvent(event);
            } catch (error) {
                log.error(`hande worker event -- failed\n${error.stack}`);
            }
        });

        const sendevent: agent.IWorkerEvent = { event: 'STARTED' };

        this.send(sendevent);
    }

    private send(message: any): void {
        if (process.send) {
            process.send(message);
        }
    }

    private onEvent(event: agent.IWorkerEvent): void {
        switch (event.event) {
            case 'INIT': {

                this.onInit(event);

                break;
            }

            case 'RUN_JOB': {
                this.runJob(event.evtarg as agent.IJob);
                break;
            }

            case 'UNDEPLOY': {
                log.debug(`executor[${this.config.oid}] undeployed`);
                process.exit(0);
                break;
            }

            case 'PROXY': {
                this.proxy = event.evtarg as agent.IProxy;
                break;
            }

            default:
                log.error(`unknown event[${event.event}]`);
        }
    }

    private onInit(event: agent.IWorkerEvent): void {
        this.config = event.evtarg as agent.IExecutor;

        try {
            this.script = new vm.Script(
                Buffer.from(this.config.script, 'base64').toString(),
                {
                    filename: this.config.oid,
                },
            );
            const sendevent: agent.IWorkerEvent = { event: 'INIT_SUCCESS' };
            this.send(sendevent);
        } catch (error) {
            log.error(`init executor[${this.config.oid}] worker -- failed\n${error.stack}`);

            const sendevent: agent.IWorkerEvent = {
                event: 'INIT_FAILED',
                evtarg: { code: 'SCRIPT_EXCEPTION', errmsg: error.toString() },
            };

            this.send(sendevent);
        }
    }

    private runJob(job: agent.IJob): void {
        log.name = `${this.config.oid}:${job.oid}`;
        log.debug(` [${this.config.oid}] run job[${JSON.stringify(job)}] ...`);

        this.send({ event: 'JOB_RUNNING', evtarg: job });

        try {
            const handlers = this.createContext(job);

            if (handlers.rawHandler) {
                handlers.rawHandler();
                return;
            }

            this.handle(job, handlers);

        } catch (error) {
            log.error(`executor[${this.config.oid}] run job[${job.oid}] -- failed\n\t${error.stack}`);

            job.result = {
                code: 'SCRIPT_EXCEPTION',
                errmsg: error.toString(),
            };

            this.send({ event: 'JOB_COMPLETED', evtarg: job });
        }
    }

    private handle(job: agent.IJob, handlers: any): void {
        if (!handlers.pageHandler) {
            job.result = { code: 'FAILED', errmsg: 'expect pageHandler' };
            this.send({ event: 'JOB_COMPLETED', evtarg: job });
            return;
        }

        if (!handlers.url) {
            job.result = { code: 'FAILED', errmsg: 'expect url' };
            this.send({ event: 'JOB_COMPLETED', evtarg: job });
            return;
        }

        let horseman = this.createHorseMan(job)
            .open(handlers.url);

        if (handlers.click) {
            horseman = horseman.click(handlers.click);
        }

        if (handlers.waitfor) {
            log.debug(`waitForSelector :${handlers.waitfor}`);
            horseman = horseman.waitForSelector(handlers.waitfor);
        }

        if (handlers.screenshot) {
            horseman = horseman.screenshot(handlers.screenshot);
        }

        //
        horseman
            .evaluate(handlers.pageHandler)
            .then((data: any) => {
                horseman.close();
                if (handlers.dataHandler) {
                    data = handlers.dataHandler(data);
                }

                if (data) {
                    this.send({
                        event: 'DATA', evtarg: {
                            content: Buffer.from(JSON.stringify(data)).toString('base64'),
                            job: job.oid,
                        },
                    });
                }
                job.result = { code: 'SUCCESS' };
                this.send({ event: 'JOB_COMPLETED', evtarg: job });
            }).then(() => {
                log.debug('run spiderjs script -- success');
            }, (err: Error) => {
                log.error(`horseman error:\n ${err.stack}`);
                horseman.close();
                job.result = { code: 'FAILED', errmsg: err.message };
                this.send({ event: 'JOB_COMPLETED', evtarg: job });
            });
    }

    private createContext(job: agent.IJob): any {
        let args: any;

        if (job.args) {
            args = JSON.parse(job.args);
        }

        const context = vm.createContext({
            args,
            completed: () => {
                job.result = { code: 'SUCCESS' };
                this.send({ event: 'JOB_COMPLETED', evtarg: job });
            },
            log,
            executor: config,
            handleData: (d: any) => {
                this.send({
                    event: 'DATA', evtarg: {
                        content: Buffer.from(JSON.stringify(d)).toString('base64'),
                        job: job.oid,
                    },
                });
            },
            horseman: () => {
                return this.createHorseMan(job);
            },
            process: (total: number, current: number) => {
                if (!total) {
                    total = 1;
                    current = 1;
                }
                if (!current) {
                    current = 0;
                }
                this.send({
                    event: 'JOB_PROCESS', evtarg: { total, current },
                });
            },
            runjob: (executor: string, ctx: any) => {
                this.send({
                    event: 'RUN_JOB', evtarg: {
                        executor,
                        args: context ? JSON.stringify(ctx) : undefined,
                        parentjob: job.oid,
                        rootjob: job.rootjob ? job.rootjob : job.oid,
                    },
                });
            },
            updateProxy: () => {
                this.send({
                    event: 'PROXY', evtarg: this.proxy,
                });
            },
            require,
            setTimeout,
        });

        // load spider handlers
        this.script.runInContext(context);

        return context;
    }

    private getRandomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    private createHorseMan(job: agent.IJob): Horseman.Horseman {
        let horseman: Horseman.Horseman;
        if (this.proxy) {
            horseman = new Horseman.Horseman({
                // loadImages: false,
                proxy: `${this.proxy.ip}:${this.proxy.port}`,
                proxyAuth: this.proxy.user ? `${this.proxy.user}:${this.proxy.passwd}` : undefined,
                proxyType: this.proxy.type,
                timeout: config.get<number>('timeout'),
            });
        } else {
            horseman = new Horseman.Horseman({
                // loadImages: false,
                timeout: config.get<number>('timeout'),
            });
        }

        // horseman = horseman.viewport(this.getRandomInt(800, 1080), this.getRandomInt(900, 1920));
        const userAgent = this.userAgents[this.getRandomInt(0, this.userAgents.length)];
        // log.debug(`use userAgent:${userAgent}`);
        // tslint:disable-next-line:max-line-length
        horseman = horseman.userAgent(userAgent);

        // horseman = horseman.cookies([]);

        horseman.on('consoleMessage', (msg: any) => {
            log.debug(msg);
        });

        horseman.on('urlChanged', (msg: any) => {
            log.debug(`url changed: ${msg}`);
        });

        horseman.on('error ', (msg: any, trace: any) => {
            log.debug(`error: ${msg}\n${trace}`);
        });

        return horseman;
    }
};

new Worker().run();
