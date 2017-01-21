import agent = require('./agent');
import server = require('./server');
import child_process = require('child_process');
import os = require('os');

export class Executor {
    constructor(private config: agent.IExecutor, private server: server.Server) {
        this.config.concurrent = this.config.concurrent ? this.config.concurrent : os.cpus.length;
    }

    public run() {
          for (let i = 0; i < this.config.concurrent; i++) {
          }
    }
}

