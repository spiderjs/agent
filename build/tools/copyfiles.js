const copydir = require('copy-dir');
const path = require('path');
const fs = require('fs');


function copyfiles() {
    let targetdir = path.join(__dirname, '../build');

    if (!fs.existsSync(targetdir)) {
        fs.mkdirSync(targetdir);
    }

    targetdir = path.join(__dirname, '../build/tools');

    if (!fs.existsSync(targetdir)) {
        fs.mkdirSync(targetdir);
    }

    targetdir = path.join(__dirname, '../build/src');

    if (!fs.existsSync(targetdir)) {
        fs.mkdirSync(targetdir);
    }

    copydir.sync(path.join(__dirname, '../src'), path.join(__dirname, '../build', 'src'));
    copydir.sync(path.join(__dirname, '../tools'), path.join(__dirname, '../build', 'tools'));
}

module.exports = copyfiles;

copyfiles();