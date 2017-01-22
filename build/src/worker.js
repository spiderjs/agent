"use strict";
const process = require("process");
const logger = require("log4js");
const vm = require("vm");
const log = logger.getLogger('spider-agent-worker');
let config;
let script;
function send(message) {
    if (process.send) {
        process.send(message);
    }
}
function init(event) {
    config = event.evtarg;
    try {
        script = new vm.Script(Buffer.from(config.script, 'base64').toString(), { filename: config.oid });
        const sendevent = { event: 'INIT_SUCCESS' };
        send(sendevent);
    }
    catch (error) {
        log.error(`init executor[${config.oid}] worker -- failed\n${error.stack}`);
        const sendevent = {
            event: 'INIT_FAILED',
            evtarg: { code: 'SCRIPT_EXCEPTION', errmsg: error.toString() }
        };
        send(sendevent);
    }
}
function runJob(job) {
    log.debug(`executor[${config.oid}] run job[${job.oid}] ...`);
    const context = vm.createContext({});
    try {
        script.runInContext(context);
    }
    catch (err) {
        log.error(`executor[${config.oid}] run job[${job.oid}] -- failed\n\t${err.stack}`);
        job.result = {
            code: 'SCRIPT_EXCEPTION',
            errmsg: err.toString(),
        };
        send({ event: 'JOB_COMPLETED', evtarg: job });
    }
}
function onWorkEvent(event) {
    switch (event.event) {
        case 'INIT': {
            init(event);
            break;
        }
        case 'RUN_JOB': {
            runJob(event.evtarg);
            break;
        }
        case 'UNDEPLOY': {
            process.exit(0);
            break;
        }
        default:
            log.error(`unknown event[${event.event}]`);
    }
}
process.on('message', (event) => {
    try {
        onWorkEvent(event);
    }
    catch (error) {
        log.error(`hande worker event -- failed\n${error.stack}`);
    }
});
const sendevent = { event: 'STARTED' };
send(sendevent);
//# sourceMappingURL=worker.js.map