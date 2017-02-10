import util = require('util');
import agent = require('./agent');
import exec = require('./executor');
import assert = require('assert');
import logger = require('log4js');

const log = logger.getLogger('spiderjs-agent');

function pcall(fun: Function): boolean {
    try {

        fun();
        return true;
    } catch (error) {
        log.error(error.stack);
        return false;
    }
}

export class Server {
    public perfUpdateInterval: number = 60000;

    public watchdog: agent.IWatchDog;
    private oid: string;
    private perf: agent.IPerf;

    private executors = new Map<string, exec.Executor>();

    constructor(oid: string, watchdog: agent.IWatchDog) {
        assert.ok(oid);
        assert.ok(watchdog);
        this.oid = oid;
        this.watchdog = watchdog;

        // init empty perf
        this.perf = {
            agent: oid,
            executors: [],
            jobs: 0,
            pending: 0,
        };

        this.watchdog.on('DEPLOY_EXECUTOR', (executor: agent.IExecutor) => {
            pcall(() => {
                this.deploy(executor);
            });
        });

        this.watchdog.on('UNDEPLOY_EXECUTOR', (executoroid: string) => {
            pcall(() => {
                this.undeploy(executoroid);
            });
        });

        this.watchdog.on('ACCEPT_AGENT', () => {
            pcall(() => {
                this.accept();
            });
        });

        this.watchdog.on('REJECT_AGENT', (result: agent.IResult) => {
            pcall(() => {
                this.reject(result);
            });
        });

        this.watchdog.on('RUN_JOB', (job: agent.IJob) => {
            pcall(() => {
                this.runJob(job);
            });
        });
    }

    public run() {
        const self = this;
        setInterval(() => {
            self.updatePerf();
        }, this.perfUpdateInterval);
    }

    public onJobCompleted(job: agent.IJob): void {
        this.perf.pending--;

        this.watchdog.onJobCompleted(job);
    }

    public onDeployCompleted(oid: string, result: agent.IResult): void {
        this.watchdog.onDeployCompleted(oid, result);
    }

    public onUndeployCompleted(oid: string, result: agent.IResult): void {
        const executor = this.executors.get(oid);

        if (executor) {
            executor.stop();
            this.executors.delete(oid);

            this.watchdog.onUndeployingCompleted(oid, result);
        }
    }

    private updatePerf(): void {
        this.perf.executors = [];

        // tslint:disable-next-line:forin
        for (const key of this.executors.keys()) {
            this.perf.executors.push(key);
        }

        log.debug(JSON.stringify(this.perf));

        this.watchdog.onUpdatePerf(this.perf);
    }

    private accept(): void {
        log.debug('recv accept event');
        this.updatePerf();
    }

    private reject(result: agent.IResult): void {
        log.debug('recv reject event :' + result);
    }

    private deploy(config: agent.IExecutor): void {

        let executor = this.executors.get(config.oid);

        if (!executor) {
            log.debug(`create new executor[${config.oid}]`);

            executor = new exec.Executor(config, this);

            executor.run();

            this.executors.set(config.oid, executor);
        }

        this.updatePerf();
    }

    private undeploy(oid: string): void {
        log.debug(`undeploy executor ${oid}`);
    }

    private runJob(job: agent.IJob): void {
        this.perf.jobs++;
        this.perf.pending++;
        const executor = this.executors.get(job.executor);

        if (!executor) {
            log.error(`can't dispatch job[${job.oid}] to executor[${job.executor}] --- executor not found`);

            job.result = {
                code: 'RESOURCE_NOT_FOUND',
                errmsg: `executor[${job.executor}] not found`,
            };

            this.onJobCompleted(job);
        } else {
            executor.runJob(job);
        }
    }
}