import config = require('config');
import log4js = require('log4js');
import express = require('express');
import guice = require('guice.js');
import apihandler = require('apihandler');
import nrpc = require('nrpc');
import api = require('./api');
log4js.configure('./config/log.json');
const logger = log4js.getLogger('spiderjs');

export class App {
    private client: nrpc.TCPClient<api.IUser>;
    constructor() {
        guice.load(guice.binder, guice.injector);

        this.client = new nrpc.TCPClient<api.IUser>({ auth: guice.injector.get<any>('auth') });

        this.client.on('connection', (peer: nrpc.IRPC) => {
            const watchdog = guice.injector.get<api.IWatchDog>('watchdog');

            watchdog.bind(peer);

            peer.accept('agent', guice.injector.get<api.IAgent>('agent'));
        });

        const args = config.get<string>('engine').split(':');

        this.client.connect(parseInt(args[1]), args[0]);
    }
}

const app = new App();
