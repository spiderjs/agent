export class Horseman {
    constructor(config?: any);
    close(): void;
    open(url: string): this;
    openTab(url: string): this;
    closeTab(tabNum: number): this;
    evaluate(fn: Function, ...args: any[]): this;
    then(success?: Function, failed?: Function): this;
    on(name: string,fn: Function): this;
    screenshot(name: string): this;
    userAgent(name: string): this;
    waitForNextPage(): this;
    click(selector: string): this;
    waitForSelector(selector: string): this;
}
