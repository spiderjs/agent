const console = require('console');
const child_process = require('child_process');
const process = require('process');
const readline = require('readline');
const logger = require('log4js').getLogger('dev');
const copyfiles = require('./copyfiles');

copyfiles();

let command;

if (process.argv[2] == 'test') {
    command = 'mocha build/test';
} else if (process.argv[2] == 'agent') {
    command = 'node build/tools/server.js';
} else {
    throw new Error(`unknown command ${process.argv[2]}`);
}

function run(command, callback) {
    const dev = child_process.exec(command, {
        env: process.env
    });

    dev.on('exit', code => {
        logger.debug(`Exist with code ${code}`);

        if (0 == code && callback) {
            callback();
        }
    });

    const lines = readline.createInterface({ input: dev.stdout });
    lines.on('line', line => {
        console.log(line);
    });

    const lines2 = readline.createInterface({ input: dev.stderr });
    lines2.on('line', line => {
        console.log(line);
    });
}

run('tsc -p .', () => {
    run(command);
});

setInterval(function() {}, 9999999);