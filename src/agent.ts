import rx = require('rx');
import nrpc = require('nrpc');
import guice = require('guice.js');
import log4js = require('log4js');
import crypto = require('crypto');
import config = require('config');
import { IAgent, ICall, IExecutor, IExecutorService, IWatchDog } from './api';

const logger = log4js.getLogger('agent');

export default class AgentService implements IAgent {
    public oid: string;
    public executors = new Map<string, IExecutorService>();

    public createExecutor(executor: IExecutor): rx.Observable<{}> {

        if (!this.executors.has(executor.oid)) {

            logger.info(`deploy executor[${executor.oid}] ...`);

            const executorService = guice.injector.get<IExecutorService>('executor');

            return executorService
                .setup(executor)
                .map((c) => {
                    this.executors.set(executor.oid, executorService);

                    logger.info(`deploy executor[${executor.oid}] -- success`);
                    return c;
                });
        } else {
            logger.warn(`deploy executor[${executor.oid}] -- skip exists`);
        }

        return rx.Observable.just({});
    }

    public deleteExecutor(oid: string): rx.Observable<{}> {

        logger.info(`undeploy executor[${oid}] ...`);

        const service = this.executors.get(oid);

        if (service) {
            logger.info(`undeploy executor[${oid}] -- found deployed`);
            return service
                .shutdown()
                .map((c) => {
                    logger.info(`undeploy executor[${oid}] -- success`);
                    this.executors.delete(oid);
                    return c;
                });
        }

        return rx.Observable.just({});
    }

    public call(call: ICall): rx.Observable<number> {
        const executor = this.executors.get(call.executor);

        if (!executor) {
            logger.warn(`can't find executor[${call.executor}]`, this.executors.keys());
            return rx.Observable.just(-2);
        }

        return executor.exec(call);
    }
}
