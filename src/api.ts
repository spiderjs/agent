import rx = require('rx');
import nrpc = require('nrpc');
import child_process = require('child_process');

export type Role = 'Agent' | 'User' | 'Admin' | 'Engine';

export interface IUser {
    oid: string;
    username: string;
    password: string;
    roles: Role[];
}

export interface IAccessKey {
    oid: string;
    key: string;
    user: string;
    roles: Role[];
}
export interface ILambda {
    name: string;  // 执行闭包名称
    type: string; // lambda 类型： 'spiderjs'|'general'
    script: string; // 执行闭包JS代码
}

export interface IApp {
    oid: string; // APP对象OID
    name: string; // APP名称
    createdby: string; // 创建者OID
    description: string; // 描述
    lambda: ILambda[];
    updateTime: string;
}

export interface IExecutor {
    oid: string; // 分布式执行引擎对象ID
    createdby: string; // 创建者OID
    app: IApp; // 执行引擎对应的程序
    accesskey: string; // 执行引擎部署的代理节点
    updateTime: string;
}

export interface ICall {
    oid: string; // Call对象OID
    app: string; // 所属应用对象OID
    executor: string; // 调用目标执行引擎对象OID
    task: string; // 所属任务对象OID
    lambda: string; // lamebda name
    timestamp?: string; // 调用产生的时间点
    params: string; // 字符串化的JSON数据
    trace?: ICallStack[]; // 调用栈跟踪
}

export interface ICallStack {
    oid: string; // 所属调用对象
    executor: string; // 所属执行引擎
    agent?: string; // 所属代理
    starttime: string; // 开始时间
    endtime: string; // 执行结束时间
}

export interface IResult {
    oid: string; // Call对象OID
    task: string;
    executor: string; // 调用目标执行引擎对象OID
    code: string;
    errmsg?: string;
    timestamp: string;
}

// tslint:disable-next-line:no-empty-interface
export interface IAgent {
    oid: string;
    executors: Map<string, IExecutorService>;
    createExecutor(executor: IExecutor): rx.Observable<{}>;
}

export interface IWatchDog {
    bind(engine: nrpc.IRPC): void;
    call(call: ICall): void;
    onCompleted(result: IResult): void;
}

export interface IExecutorService {
    executor: IExecutor;
    setup(executor: IExecutor): rx.Observable<{}>;
    shutdown(): rx.Observable<{}>;
    exec(call: ICall): rx.Observable<number>;
}

export interface IDispacher {
    sleepWorkers(): number;
    exec(executor: IExecutor, call: ICall): rx.Observable<number>;
}

export interface IWorker {
    id: number;
    process: child_process.ChildProcess;
    status: WorkerStatus;
}

export type WorkerStatus = 'STARTING' | 'SLEEP' | 'RUNNING' | 'STOPPED';
export type WorkerEvent = 'STARTED' | 'STOPPED' | 'EXEC' | 'EXEC_COMPLETED' | 'LOG' | 'DATA';

export interface IExecuteContext {
    call: ICall;
    lambda: ILambda;
}

export interface IWorkerEvent {
    event: WorkerEvent;
    arg?: IExecuteContext | ICall | IResult | IData | ILogEntry;
}

export interface ILogEntry {
    level: string;
    content: string;
}

export interface IData {
    call: string;
    task: string;
    executor: string;
    app: string;
    content: any;
    timestamp: string;
}

export interface IMQ {
    start(oid: string): void;
    send(data: IData): void;
}
