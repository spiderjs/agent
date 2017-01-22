import agent = require('./agent');
import process = require('process');
import logger = require('log4js');
import vm = require('vm');

const log = logger.getLogger('spider-agent-worker');

let config: agent.IExecutor;
let script: vm.Script;

function send(message: any) {
    if (process.send) {
        process.send(message);
    }

}

function init(event: agent.IWorkerEvent) {
    config = event.evtarg as agent.IExecutor;
    try {
        script = new vm.Script(Buffer.from(config.script, 'base64').toString(), { filename: config.oid });
        const sendevent: agent.IWorkerEvent = { event: 'INIT_SUCCESS' };
        send(sendevent);
    } catch (error) {
        log.error(`init executor[${config.oid}] worker -- failed\n${error.stack}`);

        const sendevent: agent.IWorkerEvent = {
            event: 'INIT_FAILED',
            evtarg: { code: 'SCRIPT_EXCEPTION', errmsg: error.toString() }
        };

        send(sendevent);
    }
}

function runJob(job: agent.IJob) {
    log.debug(`executor[${config.oid}] run job[${job.oid}] ...`);

    const context = vm.createContext({});

    try {
        script.runInContext(context);
    } catch (err) {
        log.error(`executor[${config.oid}] run job[${job.oid}] -- failed\n\t${err.stack}`);

        job.result = {
            code: 'SCRIPT_EXCEPTION',
            errmsg: err.toString(),
        };

        send({ event: 'JOB_COMPLETED', evtarg: job });
    }
}

function onWorkEvent(event: agent.IWorkerEvent): void {
    switch (event.event) {
        case 'INIT': {

            init(event);

            break;
        }

        case 'RUN_JOB': {
            runJob(event.evtarg as agent.IJob);
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

process.on('message', (event: agent.IWorkerEvent) => {
    try {
        onWorkEvent(event);
    } catch (error) {
        log.error(`hande worker event -- failed\n${error.stack}`);
    }
});

const sendevent: agent.IWorkerEvent = { event: 'STARTED' };

send(sendevent);


