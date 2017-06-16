

import {
    IAccessKey, IUser,
} from './api';


import rx = require('rx');
import nrpc = require('nrpc');
import config = require('config');
import crypto = require('crypto');
import apihandler = require('apihandler');
import log4js = require('log4js');

const logger = log4js.getLogger('spiderjs');

export default class UserService implements nrpc.IAuth<IAccessKey> {

    public handshake(): Buffer {

        const md5 = crypto.createHash('md5');

        md5.update(config.get<string>('accesskey.oid'));
        md5.update(config.get<string>('accesskey.key'));

        const buffer = Buffer.from(config.get<string>('accesskey.oid'));

        const data = `${config.get<string>('accesskey.oid')}#${md5.digest('hex')}`;

        logger.debug(`handshake :`, data);

        return Buffer.from(data);
    }

    public accept(buffer: Buffer): rx.Observable<apihandler.IUser<IAccessKey>> {
        return rx.Observable.just<any>(null);
    }
}

