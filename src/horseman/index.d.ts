export class Horseman {
    constructor(config?: any);
    close(): void;
    open(url: string): this;
    evaluate(fn: Function, ...args: any[]): this;
    then(success?: Function, failed?: Function): this;
}
