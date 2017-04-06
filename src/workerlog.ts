import process = require('process');
import api = require('./agent');

export class WorkerLog {
    constructor(private name: string) { }

    public trace(message: string): void {
        message = `[${name}][${process.pid}] ${message}`;
        const entry = {
            event: 'LOG',
            evtarg: {
                message,
                level: 'trace',
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public debug(message: string): void {
        message = `[${name}][${process.pid}] ${message}`;
        const entry = {
            event: 'LOG',
            evtarg: {
                message,
                level: 'debug',
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public info(message: string): void {
        message = `[${name}][${process.pid}] ${message}`;
        const entry = {
            event: 'LOG',
            evtarg: {
                message,
                level: 'info',
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public warn(message: string): void {
        message = `[${name}][${process.pid}] ${message}`;
        const entry = {
            event: 'LOG',
            evtarg: {
                message,
                level: 'warn',
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public error(message: string): void {
        message = `[${name}][${process.pid}] ${message}`;
        const entry = {
            event: 'LOG',
            evtarg: {
                message,
                level: 'error',
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public fatal(message: string): void {
        message = `[${name}][${process.pid}] ${message}`;
        const entry = {
            event: 'LOG',
            evtarg: {
                message,
                level: 'fatal',
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
}