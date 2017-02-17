import agent = require('../agent');

export class WatchDog {

    constructor(oid: string, remote?: string);

    /**
    * call when executor is deploying
    */
    onDeploying(oid: string): void;
    /**
     * call when executor deploy completed
     */
    onDeployCompleted(oid: string, result: agent.IResult): void;

    /**
     * call when executor is undeploying
     */
    onUndeploying(oid: string): void;

    /**
     * call when executor is undeploy completed
     */
    onUndeployingCompleted(oid: string, result: agent.IResult): void;
    /**
     * call when agent update perf counter data
     */
    onUpdatePerf(perf: agent.IPerf): void;

    /**
     * call when agent started
     * @param oid The agent oid
     */
    onStarted(oid: string): void;

    /**
     * call when job completed
     */
    onJobCompleted(job: agent.IJob): void;

    /**
     * call when job prepared
     */
    onJobPrepared(job: agent.IJob): void;
    /**
     * call when job running
     */
    onJobRunning(job: agent.IJob): void;

    /**
     * event listener
     */
    on(event: string | symbol, listener: Function): this;

    run(): void;
}
