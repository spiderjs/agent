import mqtt = require('mqtt');
import crypto = require('crypto');
import logger = require('log4js');
import config = require('config');

import {
    IAgent, ICall, IData, IDispacher, IExecuteContext, IExecutor,
    ILogEntry, IMQ, IResult, IWatchDog, IWorker, IWorkerEvent,
} from './api';

const log = logger.getLogger('mqtt');

export default class MQTTService implements IMQ {
    private client: mqtt.Client;

    public start(oid: string) {

        if (this.client) {
            return;
        }

        this.doStart(oid);
    }

    public send(data: IData): void {
        log.debug(`send data:${data.app}|${data.executor}|${data.task}|${data.call} ... `);
        this.client.publish(config.get<string>('mqtt.topic'), JSON.stringify(data), { qos: 1 }, (error: any) => {
            if (error) {
                log.error('################# mqtt error', error.toString());
            } else {
                log.debug('send mqtt message -- success');
            }
        });
    }

    private doStart(oid: string) {
        log.debug('start mqtt ...');

        const password = crypto
            .createHmac('sha1', config.get<string>('mqtt.secretKey'))
            .update(config.get<string>('mqtt.groupId'))
            .digest()
            .toString('base64');

        this.client = mqtt.connect(config.get<string>('mqtt.url'), {
            clientId: `${config.get<string>('mqtt.groupId')}@@@agent_${oid}`,
            password,
            username: config.get<string>('mqtt.accessKey'),
        });

        this.client.on('connect', () => {
            log.debug('mqtt connected');
        });

        this.client.on('error', (error: any) => {
            log.error('mqtt error', error.toString());
        });

        this.client.on('offline', (error: any) => {
            log.debug('mqtt offline');
        });

        this.client.on('reconnect', (error: any) => {
            log.debug('mqtt reconnect');
        });
    }
}
