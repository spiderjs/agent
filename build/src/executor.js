"use strict";
const os = require("os");
class Executor {
    constructor(config, server) {
        this.config = config;
        this.server = server;
        this.config.concurrent = this.config.concurrent ? this.config.concurrent : os.cpus.length;
    }
    run() {
        for (let i = 0; i < this.config.concurrent; i++) {
        }
    }
}
exports.Executor = Executor;
//# sourceMappingURL=executor.js.map