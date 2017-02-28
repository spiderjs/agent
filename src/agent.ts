import events = require('events');

export interface IResult {
    code: string;
    errmsg?: string;
}


export type ReceiverType = 'HTTP_HTTPS_RECIVER';

// tslint:disable-next-line:interface-name
export interface Receiver {
    oid?: string;
    vendor: string;
    type: ReceiverType;

    httpHttpsReciver?: IHttpHttpsReciver;
}

export interface IHttpHttpsReciver {
    url: string;
    signKey: string;

}
/**
 * The performance counter data
 */
export interface IPerf {
    agent: string;
    executors: string[];
    jobs: number;
    pending: number;
}

export interface IJob {
    oid?: string;
    rootjob?: string; // parent job oid
    parentjob?: string;
    executor: string;
    args?: string;
    result?: IResult;
}

export interface IData {
    job: string;
    content: string;
}

export interface IExecutor {
    oid: string;
    agent?: string;
    script: string;
    receiver?: Receiver;
    concurrent?: number;
}

export interface ITest {
    oid?: string;
    agents: string[];
    script: string;
    receiver?: Receiver;
    args: string;
}

export type WorkEvent = 'STARTED' | 'INIT_SUCCESS' | 'INIT_FAILED' | 'JOB_COMPLETED' | 'INIT' | 'RUN_JOB' | 'JOB_RUNNING' | 'UNDEPLOY' | 'DATA';

export interface IWorkerEvent {
    event: WorkEvent;

    evtarg?: IExecutor | IJob | IExecutor | IResult | IData;
}

export interface IWatchDog {
    /**
     * call when executor is deploying
     */
    onDeploying(oid: string): void;
    /**
     * call when executor deploy completed
     */
    onDeployCompleted(oid: string, result: IResult): void;

    /**
     * call when executor is undeploying
     */
    onUndeploying(oid: string): void;

    /**
     * call when executor is undeploy completed
     */
    onUndeployingCompleted(oid: string, result: IResult): void;

    /**
     * call when agent update perf counter data
     */
    onUpdatePerf(perf: IPerf): void;

    /**
     * call when agent started
     * @param oid The agent oid
     */
    onStarted(oid: string): void;

    /**
     * call when job completed
     */
    onJobCompleted(job: IJob): void;
    /**
     * call when job prepared
     */
    onJobPrepared(job: IJob): void;
    /**
     * call when job running
     */
    onJobRunning(job: IJob): void;
    /**
     * event listener
     */
    on(event: string | symbol, listener: Function): this;

    /**
     * call when spider data prepared
     */
    onData(data: IData): void;

    /**
     * call when spider script call runjob method
     */
    onRunJob(job: IJob): void;

    run(): void;
}
