import api = require('./agent');
import levelup = require('levelup');
import process = require('process');
import path = require('path');
import fs = require('fs');
import Rx = require('rx');
import logger = require('log4js');
import config = require('config');
const log = logger.getLogger('spider-agent-fq');

export interface IQueue {
    push(job: api.IJob): Rx.Observable<number>;
    pop(): Rx.Observable<api.IJob>;
    size(): number;
    remove(oid: string): Rx.Observable<api.IJob>;
    removeall(): Rx.Observable<api.IJob>;
    disponse(): void;
    startindex(): number;
    endindex(): number;
}

export class LevelQueue implements IQueue {
    private db: LevelUp;
    private start = 0;
    private end = 0;
    constructor(private name: string) {
        const dbpath = path.join(process.cwd(), 'fq', name);
        // if (fs.existsSync(dbpath)) {
        //     this.deleteFolderRecursive(dbpath);
        // }

        this.db = levelup(dbpath, { valueEncoding: 'json' });

        this.getIndex(() => {
            setInterval(() => {
                this.saveIndex();
            }, config.get<number>('heartbeat'));
        });
    }

    public startindex(): number {
        return this.start;
    }

    public endindex(): number {
        return this.end;
    }

    public disponse(): void {
        this.db.close();
    }

    public push(job: api.IJob): Rx.Observable<number> {
        const index = this.end;
        log.debug(`[${this.name}] push pending job(${this.start},${index})`);
        return Rx.Observable.create<number>((observer) => {
            this.db.put(`${index}`, job, (error) => {
                if (error) {
                    log.error(`[${this.name}] push pending job(${this.start},${index}) -- error`, error);
                    observer.onError(error);
                } else {
                    this.end++;
                    log.info(`[${this.name}] push pending job(${this.start},${index}) -- success`);
                    observer.onNext(index);
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

    private saveIndex() {
        log.info(`[${this.name}] save fq index(${this.start}, ${this.end}) ...`);
        this.db.put(`__fq_index`, { start: this.start, end: this.end }, (error) => {
            if (error) {
                log.error(`[${this.name}] save fq index -- failed`, error);
            } else {
                log.info(`[${this.name}] save fq index -- success`);
            }
        });
    }

    private getIndex(callback: any) {
        log.info(`[${this.name}] load fq index ...`);
        this.db.get(`__fq_index`, (error, value) => {
            if (error) {
                log.error(`[${this.name}] load fq index -- failed`, error);
            } else {
                this.start = value.start;
                this.end = value.end;

                log.info(`[${this.name}] load fq index -- success(${this.start}, ${this.end})`);
            }

            callback();
        });
    }

    private doPop(observer: Rx.Observer<api.IJob>): void {
        log.debug(`[${this.name}] pop pending job(${this.start},${this.end})`);
        if (this.start === this.end) {
            observer.onCompleted();
            return;
        }
        const index = this.start;
        this.start++;

        this.db.get(`${index}`, (error, value) => {
            if (error) {
                log.debug(`[${this.name}] pop pending job(${index},${this.end}) -- error`, error);
                if (error.notFound) {

                    this.doPop(observer);
                } else {
                    observer.onError(error);
                }

            } else {
                log.debug(`[${this.name}] pop pending job(${index},${this.end}) -- success`, value);
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

