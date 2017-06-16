import rx = require('rx');
import nrpc = require('nrpc');
import log4js = require('log4js');
import crypto = require('crypto');
import config = require('config');
import { IAgent, ICall, IDispacher, IExecutor, IExecutorService, IWatchDog } from './api';

const logger = log4js.getLogger('agent');

export default class ExecutorService implements IExecutorService {
    public executor: IExecutor;
    constructor(
        private watchdog: IWatchDog,
        private dispatcher: IDispacher) {

    }

    public setup(executor: IExecutor): rx.Observable<{}> {
        this.executor = executor;
        return rx.Observable.just({});
    }

    public shutdown(): rx.Observable<{}> {
        return rx.Observable.just({});
    }

    public exec(call: ICall): rx.Observable<number> {
        return this.dispatcher.exec(this.executor, call);
    }
}
