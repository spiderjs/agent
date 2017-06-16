import rx = require('rx');
import path = require('path');
import nrpc = require('nrpc');
import log4js = require('log4js');
import crypto = require('crypto');
import config = require('config');
import child_process = require('child_process');

import {
    IAgent, ICall, IData, IDispacher, IExecuteContext, IExecutor,
    ILogEntry, IMQ, IResult, IWatchDog, IWorker, IWorkerEvent,
} from './api';

const logger = log4js.getLogger('dispatcher');
const workerlogger = log4js.getLogger('worker') as any;

const cwd = path.join(__dirname, '..');
const workerjs = path.join(__dirname, 'worker.js');

export default class DispatcherService implements IDispacher {

    private workers = new Map<number, IWorker>();

    private counter = 0;

    constructor(
        private watchdog: IWatchDog,
        private mq: IMQ) {
        for (let i = 0; i < config.get<number>('workers'); i++) {
            this.createWorker(i);
        }
    }

    public exec(executor: IExecutor, call: ICall): rx.Observable<number> {

        const worker = Array
            .from(this.workers.values())
            .find((w) => {
                return w.status === 'SLEEP';
            });

        if (!worker) {
            return rx.Observable.just(-1);
        }

        const lambda = executor.app.lambda.find((c) => c.name === call.lambda);

        if (lambda) {
            const context: IExecuteContext = {
                call,
                lambda,
            };

            const event: IWorkerEvent = {
                arg: context,
                event: 'EXEC',
            };

            if (worker.process.send(event)) {
                worker.status = 'RUNNING';
            }

            return rx.Observable.just(this.sleepWorkers());

        } else {
            logger.debug(`unknown lambda`, call.lambda);
            return rx.Observable.throw<number>(new Error(`unknown entry: ${call.lambda}`));
        }
    }

    public sleepWorkers(): number {
        return Array
            .from(this.workers.values())
            .filter((worker) => {
                return worker.status === 'SLEEP';
            }).length;
    }

    private createWorker(id: number) {
        const child = child_process.fork(workerjs, undefined, { cwd });
        const worker: IWorker = { id, process: child, status: 'STARTING' };

        this.workers.set(id, worker);

        worker.process.on('exit', (code, signal) => {
            logger.debug(` worker[${worker.process.pid}] exit with code ${code} : ${signal}`);

            this.workers.delete(worker.id);

            this.createWorker(worker.id);
        });

        worker.process.on('error', (error) => {
            logger.error(`worker[${worker.process.pid}] raise error :${error}`);
        });

        worker.process.on('message', (event: IWorkerEvent) => {
            logger.debug(`recv worker event[${event.event}]`);
            try {
                this.onWorkerEvent(worker, event);
            } catch (error) {
                logger.error(`process worker event[${event.event}] -- failed\n${error.stack}`);
            }
        });
    }

    private onWorkerEvent(worker: IWorker, event: IWorkerEvent) {
        switch (event.event) {
            case 'STARTED': {
                this.onWorkerStarted(worker);
                break;
            }
            case 'EXEC_COMPLETED': {
                this.onExecCompleted(worker, event.arg as IResult);
                break;
            }
            case 'LOG': {
                this.onLogger(worker, event.arg as ILogEntry);
                break;
            }
            case 'DATA': {
                this.onData(worker, event.arg as IData);
                break;
            }
            case 'EXEC': {
                this.onCall(worker, event.arg as ICall);
                break;
            }
        }
    }

    private onWorkerStarted(worker: IWorker) {
        logger.debug(`worker[${worker.id}:${worker.process.pid}] started`);
        worker.status = 'SLEEP';
    }

    private onExecCompleted(worker: IWorker, result: IResult) {
        // tslint:disable-next-line:no-trailing-whitespace
        logger.debug(`worker[${worker.id}:${worker.process.pid}] execute completed,${JSON.stringify(result)}`);

        worker.status = 'SLEEP';

        this.watchdog.onCompleted(result);
    }

    private onLogger(worker: IWorker, entry: ILogEntry) {
        // tslint:disable-next-line:no-trailing-whitespace
        workerlogger[entry.level](entry.content);
    }

    private onData(worker: IWorker, message: IData) {
        this.mq.send(message);
    }

    private onCall(worker: IWorker, call: ICall) {
        this.watchdog.call(call);
    }
}
