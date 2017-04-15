import process = require('process');
import api = require('./agent');

export class WorkerLog {
    constructor(public name: string) { }

    public trace(message: string, ...args: any[]): void {
        message = `[${this.name}][${process.pid}] ${message} \n${args.join('\n')}`;
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
    public debug(message: string, ...args: any[]): void {
        message = `[${this.name}][${process.pid}] ${message} \n${args.join('\n')}`;
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
    public info(message: string, ...args: any[]): void {
        message = `[${this.name}][${process.pid}] ${message}\n${args.join('\n')}`;
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
    public warn(message: string, ...args: any[]): void {
        message = `[${this.name}][${process.pid}] ${message}\n${args.join('\n')}`;
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
    public error(message: string, ...args: any[]): void {
        message = `[${this.name}][${process.pid}] ${message}\n${args.join('\n')}`;
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
    public fatal(message: string, ...args: any[]): void {
        message = `[${this.name}][${process.pid}] ${message}\n${args.join('\n')}`;
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