import api = require('./agent');
import levelup = require('levelup');
import process = require('process');
import path = require('path');
import fs = require('fs');
import Rx = require('rx');
import logger = require('log4js');
const log = logger.getLogger('spider-agent-fq');

export interface IQueue {
    push(job: api.IJob): Rx.Observable<number>;
    pop(): Rx.Observable<api.IJob>;
    size(): number;
    remove(oid: string): Rx.Observable<api.IJob>;
    removeall(): Rx.Observable<api.IJob>;
    disponse(): void;
}

export class LevelQueue implements IQueue {
    private db: LevelUp;
    private start = 0;
    private end = 0;
    constructor(private name: string) {
        const dbpath = path.join(process.cwd(), 'fq', name);
        if (fs.existsSync(dbpath)) {
            this.deleteFolderRecursive(dbpath);
        }

        this.db = levelup(dbpath, { valueEncoding: 'json', keyEncoding: 'json' });
    }

    public disponse(): void {
        this.db.close();
    }

    public push(job: api.IJob): Rx.Observable<number> {
        return Rx.Observable.create<number>((observer) => {
            this.db.put(this.end, job, (error) => {
                if (error) {
                    observer.onError(error);
                } else {
                    this.end++;
                    observer.onNext(this.end);
                    observer.onCompleted();
                }
            });
        });
    }

    public pop(): Rx.Observable<api.IJob> {
        return Rx.Observable.create<api.IJob>((observer) => {
            this.doPop(observer);
        });
    }

    public size(): number {
        return this.end - this.start;
    }

    public remove(oid: string): Rx.Observable<api.IJob> {
        return Rx.Observable.create<number>((observer) => {
            this.db.get(oid, (error, value) => {
                if (error) {
                    if (error.notFound) {
                        observer.onCompleted();
                    } else {
                        observer.onError(error);
                    }
                } else {
                    observer.onNext(value);
                    observer.onCompleted();
                }
            });
        }).flatMap((index) => {
            return Rx.Observable.create<number>((observer) => {
                this.db.del(index, (error) => {
                    if (error) {
                        if (error.notFound) {
                            observer.onCompleted();
                        } else {
                            observer.onError(error);
                        }
                    } else {
                        observer.onNext(index);
                        observer.onCompleted();
                    }
                });
            });
        }).flatMap((index) => {
            return this.getAndDel(index);
        });
    }

    public removeall(): Rx.Observable<api.IJob> {

        const pop = (observer: Rx.Observer<api.IJob>) => {
            this.pop().subscribe((job) => {
                observer.onNext(job);
                pop(observer);
            }, (error) => {
                observer.onError(error);
            }, () => {
                observer.onCompleted();
            });
        };

        return Rx.Observable.create<api.IJob>(pop);
    }

    private doPop(observer: Rx.Observer<api.IJob>): void {
        log.debug(`[${this.name}] pop pending job(${this.start},${this.end})`);
        if (this.start === this.end) {
            observer.onCompleted();
            return;
        }

        this.db.get(this.start, (error, value) => {
            if (error) {
                log.debug(`[${this.name}] pop pending job(${this.start},${this.end}) -- error`, error);
                if (error.notFound) {
                    this.start++;
                    this.doPop(observer);
                } else {
                    observer.onError(error);
                }

            } else {
                log.debug(`[${this.name}] pop pending job(${this.start},${this.end}) -- success`, value);
                this.start++;
                observer.onNext(value);
                observer.onCompleted();
            }
        });
    }

    private getAndDel(index: number): Rx.Observable<api.IJob> {
        return Rx.Observable.create<api.IJob>((observer) => {
            this.db.get(index, (error, value) => {
                if (error) {
                    if (error.notFound) {
                        observer.onCompleted();
                    } else {
                        observer.onError(error);
                    }
                } else {
                    observer.onNext(value);
                    observer.onCompleted();
                }
            });
        }).flatMap((job) => {
            return Rx.Observable.create<api.IJob>((observer) => {
                this.db.del(index, (error) => {
                    if (error) {
                        if (error.notFound) {
                            observer.onCompleted();
                        } else {
                            observer.onError(error);
                        }
                    } else {
                        observer.onNext(job);
                        observer.onCompleted();
                    }
                });
            });
        });
    }

    private deleteFolderRecursive(path: string) {
        if (fs.existsSync(path)) {
            fs.readdirSync(path).forEach((file, index) => {
                const curPath = path + '/' + file;
                if (fs.lstatSync(curPath).isDirectory()) { // recurse
                    this.deleteFolderRecursive(curPath);
                } else { // delete file
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(path);
        }
    };
};

