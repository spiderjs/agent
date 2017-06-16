import rx = require('rx');
import vm = require('vm');
import fs = require('fs');
import path = require('path');
import zlib = require('zlib');
import util = require('util');
import config = require('config');
import process = require('process');
import workerlog = require('./workerlog');
import horseman = require('./horseman');

import {
    IAgent, ICall, IData, IDispacher, IExecuteContext, ILambda, ILogEntry,
    IResult, IWatchDog, IWorker, IWorkerEvent,
} from './api';

const logger = new workerlog.WorkerLog('worker');

class Worker {
    private userAgents: string[];
    constructor() {
        process.on('message', (event: IWorkerEvent) => {
            try {
                this.onEvent(event);
            } catch (error) {
                logger.error(`hande worker event -- failed\n${error.stack}`);
            }
        });

        this.send({
            event: 'STARTED',
        });

        const userAgentFile = path.join(process.cwd(), 'config/userAgent.json');

        this.userAgents = JSON.parse(fs.readFileSync(userAgentFile, 'UTF-8'));
    }

    private send(event: IWorkerEvent): void {
        if (process.send) {
            process.send(event);
        }
    }

    private rxsend(topob: rx.Observer<IResult>, call: ICall, event: IWorkerEvent): rx.Observable<{}> {

        return rx.Observable.create((ob) => {
            if (process.send) {
                process.send(event, (error: any) => {
                    if (error) {
                        ob.onError(error);
                    } else {
                        try {
                            ob.onNext(true);
                            ob.onCompleted();
                        } catch (error) {
                            const result: IResult = {
                                code: `LAMBDA_EXCEPTION`,
                                executor: call.executor,
                                errmsg: error.toString(),
                                oid: call.oid,
                                task: call.task,
                                timestamp: new Date().toISOString(),
                            };

                            topob.onNext(result);
                            topob.onCompleted();
                        }

                    }
                });
            } else {
                ob.onError(`broken pipe`);
            }
        });

    }

    private onEvent(event: IWorkerEvent): void {
        switch (event.event) {
            case 'EXEC': {
                this.onExec(event.arg as IExecuteContext);
                break;
            }
            default:
                logger.error(`unknown event[${event.event}]`);
        }
    }

    // tslint:disable-next-line:no-empty
    private onExec(context: IExecuteContext) {
        const name = `${context.call.app}|${context.call.executor}|${context.call.lambda}`;
        logger.debug(`start exec ${name} ...`);

        this
            .compile(context.lambda)
            .flatMap((script) => {
                // tslint:disable-next-line:max-line-length
                logger.debug(`compile script ${name} -- success`);
                return this.exec(script, context.call);
            })
            .subscribe((result) => {
                if (result.code === 'SUCCESS') {
                    logger.debug(`execute script ${name} -- success`);
                } else {
                    logger.debug(`execute script ${name} -- failed`, result.errmsg);
                }

                const event: IWorkerEvent = {
                    arg: result,
                    event: 'EXEC_COMPLETED',
                };

                this.send(event);
            }, (error) => {
                logger.debug(`compile script ${name} -- failed`, error);
                const result: IResult = {
                    code: `COMPILE_SPIDERJS_EXCEPTION`,
                    errmsg: error.toString(),
                    executor: context.call.executor,
                    oid: context.call.oid,
                    task: context.call.task,
                    timestamp: new Date().toISOString(),
                };
                const event: IWorkerEvent = {
                    arg: result,
                    event: 'EXEC_COMPLETED',
                };

                this.send(event);
            });
    }

    private compile(lambda: ILambda): rx.Observable<vm.Script> {

        const script = zlib.gunzipSync(Buffer.from(lambda.script, 'base64')).toString();

        // logger.trace(`run script:`, script);

        return rx.Observable.create<vm.Script>((ob) => {
            try {
                ob.onNext(new vm.Script(script, { filename: lambda.name, displayErrors: true }));
                ob.onCompleted();
            } catch (error) {
                ob.onError(error);
            }
        });
    }

    private exec(script: vm.Script, call: ICall): rx.Observable<IResult> {
        const name = `${call.app}|${call.executor}|${call.lambda}`;

        return rx.Observable.create<IResult>((ob) => {
            try {
                logger.debug(`create script context ${name} ...`);
                const context = this.createContext(ob, script, call) as any;
                logger.debug(`create script context ${name} -- success`);
                if (context.main) {
                    context.main();
                }

            } catch (error) {
                const result: IResult = {
                    code: `EXEC_SPIDERJS_EXCEPTION`,
                    errmsg: error.stack,
                    executor: call.executor,
                    oid: call.oid,
                    task: call.task,
                    timestamp: new Date().toISOString(),
                };

                ob.onNext(result);
                ob.onCompleted();
            }
        });
    }

    private createContext(ob: rx.Observer<IResult>, script: vm.Script, call: ICall): vm.Context {

        const sj = {
            call: (lambda: string, params: any) => {
                const nextcall: ICall = {
                    app: call.app,
                    executor: call.executor,
                    lambda,
                    oid: call.oid,
                    params: JSON.stringify(params),
                    task: call.task,
                    timestamp: new Date().toISOString(),
                    trace: call.trace,
                };

                if (!nextcall.trace) {
                    nextcall.trace = [];
                }

                nextcall.trace.push({
                    endtime: new Date().toISOString(),
                    executor: call.executor,
                    oid: call.oid as string,
                    starttime: call.timestamp as string,
                });

                if (nextcall.trace.length > 4) {
                    nextcall.trace = nextcall.trace.splice(nextcall.trace.length - 4);
                }

                const event: IWorkerEvent = {
                    arg: nextcall,
                    event: 'EXEC',
                };

                return this.rxsend(ob, call, event);
            },
            data: (obj: any) => {

                const data: IData = {
                    app: call.app,
                    call: call.oid,
                    content: JSON.stringify(obj),
                    executor: call.executor,
                    task: call.task,
                    timestamp: new Date().toISOString(),
                };

                const event: IWorkerEvent = {
                    arg: data,
                    event: 'DATA',
                };

                return this.rxsend(ob, call, event);
            },
            brower: (url: string, evaluate: any, waitfor?: string) => {
                return this.runbrower(ob, call, url, evaluate, waitfor);
            },
            logger,
            params: JSON.parse(call.params),
            run: (observable: rx.Observable<{}>) => {
                try {
                    observable.subscribe(
                        () => {

                        },
                        (error) => {
                            const result: IResult = {
                                code: `LAMBDA_EXCEPTION`,
                                executor: call.executor,
                                errmsg: error.toString(),
                                oid: call.oid,
                                task: call.task,
                                timestamp: new Date().toISOString(),
                            };

                            ob.onNext(result);
                            ob.onCompleted();
                        },
                        () => {
                            const result: IResult = {
                                code: `SUCCESS`,
                                executor: call.executor,
                                oid: call.oid,
                                task: call.task,
                                timestamp: new Date().toISOString(),
                            };

                            ob.onNext(result);
                            ob.onCompleted();
                        }
                    );
                } catch (error) {
                    const result: IResult = {
                        code: `LAMBDA_EXCEPTION`,
                        executor: call.executor,
                        errmsg: error.toString(),
                        oid: call.oid,
                        task: call.task,
                        timestamp: new Date().toISOString(),
                    };

                    ob.onNext(result);
                    ob.onCompleted();
                }
            },
        };

        const context = vm.createContext({
            logger,
            require,
            sj,
        });

        script.runInContext(context, { displayErrors: true, timeout: 60000 });

        return context;
    }

    private getRandomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    private runbrower(topob: rx.Observer<IResult>, call: ICall, url: string, evaluate: any, waitfor?: string): rx.Observable<any> {
        let webbrower = this
            .createHorseman()
            .open(url);

        if (waitfor) {
            webbrower = webbrower.waitForSelector(waitfor);
        }

        return rx.Observable.create((ob) => {
            webbrower
                .evaluate(evaluate)
                .then((data: any) => {
                    try {
                        ob.onNext(data);
                        ob.onCompleted();
                    } catch (error) {
                        logger.error(`catch unhandled error`, error.stack);
                        const result: IResult = {
                            code: `LAMBDA_EXCEPTION`,
                            executor: call.executor,
                            errmsg: error.toString(),
                            oid: call.oid,
                            task: call.task,
                            timestamp: new Date().toISOString(),
                        };

                        topob.onNext(result);
                        topob.onCompleted();
                    }
                }, (error: any) => {
                    ob.onError(error);
                })
                .close();
        });
    }

    private createHorseman(): horseman.Horseman {
        let webbrower = new horseman.Horseman({
            ignoreSSLErrors: true,
            // timeout: config.get<number>('timeout'),
        });

        const userAgent = this.userAgents[this.getRandomInt(0, this.userAgents.length)];
        // log.debug(`use userAgent:${userAgent}`);
        // tslint:disable-next-line:max-line-length
        webbrower = webbrower.userAgent(userAgent);

        webbrower.on('consoleMessage', (msg: any) => {
            logger.debug(msg);
        });

        webbrower.on('urlChanged', (msg: any) => {
            logger.debug(`url changed: ${msg}`);
        });

        webbrower.on('error ', (msg: any, trace: any) => {
            logger.debug(`error: ${msg}\n${trace}`);
        });


        return webbrower;
    }
}

// tslint:disable-next-line:no-unused-expression
new Worker();
