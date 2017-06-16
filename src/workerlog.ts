import process = require('process');

export class WorkerLog {
    constructor(public name: string) { }

    public trace(content: string, ...args: any[]): void {
        content = `[${process.pid}] ${content} \n${args.join('\n')}`;
        const entry = {
            event: 'LOG',
            arg: {
                level: 'trace',
                content,
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public debug(content: string, ...args: any[]): void {
        content = `[${process.pid}] ${content} \n${args.join('\n')}`;
        const entry = {
            event: 'LOG',
            arg: {
                level: 'debug',
                content,
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public info(content: string, ...args: any[]): void {
        content = `[${process.pid}] ${content}\n${args.join('\n')}`;
        const entry = {
            event: 'LOG',
            arg: {
                level: 'info',
                content,
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public warn(content: string, ...args: any[]): void {
        content = `[${process.pid}] ${content}\n${args.join('\n')}`;
        const entry = {
            event: 'LOG',
            arg: {
                level: 'warn',
                content,
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public error(content: string, ...args: any[]): void {
        content = `[${process.pid}] ${content}\n${args.join('\n')}`;
        const entry = {
            event: 'LOG',
            arg: {
                level: 'error',
                content,
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
    public fatal(content: string, ...args: any[]): void {
        content = `[${process.pid}] ${content}\n${args.join('\n')}`;
        const entry = {
            event: 'LOG',
            arg: {
                level: 'fatal',
                content,
            },
        };

        if (process.send) {
            process.send(entry);
        }
    }
}
