import path = require('path');
import agent = require('./agent');
import process = require('process');
import logger = require('log4js');
import vm = require('vm');
import Horseman = require('./horseman');
import util = require('util');

const log = logger.getLogger(`spiderjs-agent-worker`);

const configpath = path.join(__dirname, '/../../config/log.json');

log.debug(configpath);

logger.configure(configpath, { reloadSecs: 600 });

let config: agent.IExecutor;
let script: vm.Script;

let horseman: Horseman.Horseman;

function send(message: any) {
    if (process.send) {
        process.send(message);
    }
}

function init(event: agent.IWorkerEvent) {
    config = event.evtarg as agent.IExecutor;

    try {
        script = new vm.Script(Buffer.from(config.script, 'base64').toString(), { filename: config.oid });
        const sendevent: agent.IWorkerEvent = { event: 'INIT_SUCCESS' };
        send(sendevent);
    } catch (error) {
        log.error(`init executor[${config.oid}] worker -- failed\n${error.stack}`);

        const sendevent: agent.IWorkerEvent = {
            event: 'INIT_FAILED',
            evtarg: { code: 'SCRIPT_EXCEPTION', errmsg: error.toString() },
        };

        send(sendevent);
    }
}

function runJob(job: agent.IJob) {
    log.debug(`executor[${config.oid}] run job[${JSON.stringify(job)}] ...`);

    send({ event: 'JOB_RUNNING', evtarg: job });

    try {

        if (job.proxy) {
            log.debug(`use proxy :${JSON.stringify(job.proxy)}`);
            horseman = new Horseman.Horseman({
                loadImages: false,
                proxy: `${job.proxy.ip}:${job.proxy.port}`,
                proxyAuth: job.proxy.user ? `${job.proxy.user}:${job.proxy.passwd}` : null,
                proxyType: job.proxy.type,
                timeout: 10000,
            });
        } else {
            horseman = new Horseman.Horseman({
                loadImages: false,
                timeout: 10000,
            });
        }

        let args: any;

        if (job.args) {
            args = JSON.parse(job.args);
        }

        const context = vm.createContext({
            args,
            log,
            executor: config,
            horseman,
            runjob(executor: string, ctx: any) {
                send({
                    event: 'RUN_JOB', evtarg: {
                        executor,
                        args: context ? JSON.stringify(ctx) : undefined,
                        parentjob: job.oid,
                        rootjob: job.rootjob ? job.rootjob : job.oid,
                    },
                });
            },
        });
        // load spider handlers
        script.runInContext(context);

        const handlers = context as any;

        if (!handlers.pageHandler) {
            job.result = { code: 'FAILED', errmsg: 'expect pageHandler' };
            send({ event: 'JOB_COMPLETED', evtarg: job });
            return;
        }

        if (!handlers.url) {
            job.result = { code: 'FAILED', errmsg: 'expect url' };
            send({ event: 'JOB_COMPLETED', evtarg: job });
            return;
        }

        horseman.open(handlers.url)
            .evaluate(handlers.pageHandler)
            .then((data: any) => {
                horseman.close();
                if (handlers.dataHandler) {
                    data = handlers.dataHandler(data);
                }

                if (data) {
                    send({
                        event: 'DATA', evtarg: {
                            content: Buffer.from(JSON.stringify(data)).toString('base64'),
                            job: job.oid,
                        },
                    });
                }
                job.result = { code: 'SUCCESS' };
                send({ event: 'JOB_COMPLETED', evtarg: job });
            }, (err: Error) => {
                horseman.close();
                job.result = { code: 'FAILED', errmsg: err.message };
                send({ event: 'JOB_COMPLETED', evtarg: job });
            });
    } catch (err) {
        log.error(`executor[${config.oid}] run job[${job.oid}] -- failed\n\t${err.stack}`);

        job.result = {
            code: 'SCRIPT_EXCEPTION',
            errmsg: err.toString(),
        };

        send({ event: 'JOB_COMPLETED', evtarg: job });
    }
}

function onWorkEvent(event: agent.IWorkerEvent): void {
    switch (event.event) {
        case 'INIT': {

            init(event);

            break;
        }

        case 'RUN_JOB': {
            runJob(event.evtarg as agent.IJob);
            break;
        }

        case 'UNDEPLOY': {
            log.debug(`executor[${config.oid}] undeployed`);
            process.exit(0);
            break;
        }

        default:
            log.error(`unknown event[${event.event}]`);
    }
}

process.on('message', (event: agent.IWorkerEvent) => {
    try {
        onWorkEvent(event);
    } catch (error) {
        log.error(`hande worker event -- failed\n${error.stack}`);
    }
});

const sendevent: agent.IWorkerEvent = { event: 'STARTED' };

send(sendevent);
;
