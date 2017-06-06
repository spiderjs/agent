import path = require('path');
import assert = require('assert');
import logger = require('log4js');
import process = require('process');
import Server = require('../src/server');
import WatchDog = require('../src/watchdog');
import config = require('config');
import fs = require('fs');
import zlib = require('zlib');

const log = logger.getLogger('spiderjs-agent');

const configpath = path.join(__dirname, '/../../config/log.json');

log.debug(configpath);

logger.configure(configpath, { reloadSecs: 600 });

const watchdog = new WatchDog.WatchDog(config.get<string>('agent'), config.get<string>('watchdog'));

function readLines(input: any, func: any, complete: any) {
    let remaining = '';

    input.on('data', (data: any) => {
        remaining += data;
        let index = remaining.indexOf('\n');
        let last = 0;
        while (index > -1) {
            const line = remaining.substring(last, index);
            last = index + 1;
            if (!func(line)) {
                complete();
            }

            index = remaining.indexOf('\n', last);
        }

        remaining = remaining.substring(last);
    });

    input.on('end', complete);
}

const listread = fs.createReadStream('d:/workspace/spiderjs-github/aliyun-datahandler/list.txt', 'utf8');

readLines(listread, (data: any) => {
    const line = JSON.parse(data);

    log.info('run list ...');

    const items = line.data.items.filter((item: any) => {
        return item.popsells !== '0人付款';
    });

    const args = JSON.stringify({
        catalog: line.data.url,
        items,
    });

    const compressed = zlib.gzipSync(Buffer.from(args)).toString('base64');

    log.info('length:', args.length, compressed.length);


    // watchdog.onRunJob({
    //     args,
    //     executor: 'ER571eed69af400000',
    // });

    return true;
    // tslint:disable-next-line:no-empty
}, () => {

});

