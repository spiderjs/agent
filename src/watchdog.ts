import rx = require('rx');
import fs = require('fs');
import nrpc = require('nrpc');
import guice = require('guice.js');
import log4js = require('log4js');
import crypto = require('crypto');
import config = require('config');
import levelq = require('levelq.js');
import { EventEmitter } from 'events';
import { IAgent, ICall, IDispacher, IExecutor, IMQ, IResult, IWatchDog } from './api';

const logger = log4js.getLogger('watchdog');

export default class WatchDogService implements IWatchDog {
    private engine: nrpc.IRPC;
    private agentfile = './config/agent.oid';
    private levelqService = new levelq.LevelQService('./fq', config.get<number>('fq.flush'));
    private callQ: levelq.IFIFO;
    private resultQ: levelq.IFIFO;
    private sendCall = false;
    private sendResult = false;
    constructor(
        private agent: IAgent,
        private mq: IMQ) {

        setInterval(() => {
            this.keepalive()
                .subscribe(() => {
                    logger.debug(`send keepalive -- success`);
                }, (error) => {
                    logger.error(`send keepalive -- failed`, error);
                });
        }, config.get<number>('keepalive') * 1000);

        this.levelqService
            .createQ('callQ')
            .subscribeOnNext((callQ) => {
                this.callQ = callQ;
            });

        this.levelqService
            .createQ('resultQ')
            .subscribeOnNext((resultQ) => {
                this.resultQ = resultQ;
            });
    }

    public bind(engine: nrpc.IRPC): void {
        this.engine = engine;

        this.startup()
            .subscribe(() => {
                logger.debug(`startup agent -- success`);
            }, (error) => {
                logger.error(`startup agent error :`, error);
            });
    }

    // tslint:disable-next-line:no-empty
    public call(call: ICall) {
        this.callQ
            .push(call)
            .subscribe(() => {
                this.doCall();
            }, (error) => {
                logger.error(`push call -- failed`, error);
            });
    }

    public onCompleted(result: IResult): void {
        this.resultQ
            .push(result)
            .subscribe(() => {
                this.doCompleted();
            }, (error) => {
                logger.error(`push result -- failed`, error);
            });
    }

    private doCompleted() {
        if (!this.sendResult) {
            logger.debug(`try send result ...`);
            this.sendResult = true;
            this.resultQ
                .pop<IResult>()
                .flatMap((result) => {
                    return this.remoteCompleted(result)
                        .catch((error) => {
                            return this.resultQ
                                .push(result)
                                .map(() => {
                                    throw error;
                                });
                        });
                })
                .count()
                .subscribe((c) => {
                    this.sendResult = false;
                    if (c > 0) {
                        logger.debug(`send result -- success`);
                        this.doCompleted();
                    }
                }, (error) => {
                    this.sendResult = false;
                    logger.error(`send result -- failed`, error);
                }, () => {
                    logger.debug(`send result -- completed`);
                });
        }
    }

    private doCall() {
        if (!this.sendCall) {
            logger.debug(`try send call ...`);
            this.sendCall = true;
            this.callQ
                .pop<ICall>()
                .flatMap((call) => {
                    return this.remoteCall(call)
                        .catch((error) => {

                            const code = (error as any).code;

                            if (code === 'TASK_COMPLETED' || code === 'RESOURCE_NOT_FOUND') {
                                logger.warn(`drop call[${call.oid}]`);
                                return rx.Observable.just({});
                            }

                            return this.callQ
                                .push(call)
                                .map(() => {
                                    throw error;
                                });
                        });
                })
                .count()
                .subscribe((c) => {
                    this.sendCall = false;
                    if (c > 0) {
                        logger.debug(`push call -- success`);
                        this.doCall();
                    }
                }, (error) => {
                    this.sendCall = false;
                    logger.error(`push call -- failed`, error);
                }, () => {
                    logger.debug(`push call -- completed`);
                });
        }
    }

    private remoteCall(call: ICall): rx.Observable<{}> {
        return this.engine.call('POST /watchdog/call', { call });
    }

    private remoteCompleted(result: IResult): rx.Observable<{}> {
        return this.engine.call('POST /watchdog/completed', { result });
    }

    private keepalive(): rx.Observable<{}> {

        const dispatcher = guice.injector.get<IDispacher>('dispatcher');

        this.doCall();
        this.doCompleted();

        if (dispatcher.sleepWorkers() === 0) {
            return rx.Observable.empty();
        }

        return this.engine.call('POST /watchdog/keepalive');
    }

    private startup(): rx.Observable<{}> {
        return this.readAgentID()
            .flatMap((agent) => {
                logger.debug('', agent);
                return this.engine.call<string>('POST /watchdog/startup', { oid: agent.oid });
            })
            .flatMap((oid) => {
                logger.debug(`startup agent with oid: ${oid}`);
                return this.writeAgentID(oid);
            })
            .flatMap(() => {
                return this.getExecutors();
            })
            .flatMap((executor) => {
                return this.agent.createExecutor(executor);
            })
            .count()
            .map(() => {

                this.mq.start(this.agent.oid);

                return {};
            });

    }

    private getExecutors(): rx.Observable<IExecutor> {
        return this.engine.call<IExecutor>('POST /watchdog/executors');
    }

    private readAgentID(): rx.Observable<any> {

        if (!fs.existsSync(this.agentfile)) {
            return rx.Observable.just({});
        }

        return rx.Observable.create<string>((ob) => {
            fs.readFile(this.agentfile, 'utf-8', (err: any, data: string) => {
                if (err) {
                    ob.onError(err);
                } else {
                    ob.onNext(JSON.parse(data));
                    ob.onCompleted();
                }
            });
        });
    }

    private writeAgentID(oid: string): rx.Observable<string> {
        return this
            .readAgentID()
            .flatMap((agent) => {
                agent.oid = oid;
                this.agent.oid = oid;

                return rx.Observable.create<string>((ob) => {
                    fs.writeFile(this.agentfile, JSON.stringify(agent), (err: any, data: string) => {
                        if (err) {
                            ob.onError(err);
                        } else {
                            ob.onNext(oid);
                            ob.onCompleted();
                        }
                    });
                });
            });
    }
}
