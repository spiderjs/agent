export class Horseman {
    constructor(config?: any);
    public close(): void;
    public open(url: string): this;
    public openTab(url: string): this;
    public closeTab(tabNum: number): this;
    public evaluate(fn: Function, ...args: any[]): this;
    public then(success?: Function, failed?: Function): this;
    public on(name: string, fn: Function): this;
    public screenshot(name: string): this;
    public userAgent(name: string): this;
    public waitForNextPage(): this;
    public click(selector: string): this;
    public waitForSelector(selector: string): this;
}
