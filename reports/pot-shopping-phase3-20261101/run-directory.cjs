'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const LOCK_FILE = '.checkpoint.lock';
const LOCK_FD_ENV = 'POT_SHOPPING_RUN_LOCK_FD';

function externalRunDirectory(root, raw) {
    const directory = fs.realpathSync(raw);
    const relative = path.relative(fs.realpathSync(root), directory);
    if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)))
        throw Error('raw_evidence_must_be_external');
    if (!fs.statSync(directory).isDirectory()) throw Error('run_directory_required');
    return directory;
}

function acquireRunLock(directory, inherited = process.env[LOCK_FD_ENV]) {
    const lockPath = path.join(directory, LOCK_FILE);
    const openedHere = inherited === undefined;
    const fd = openedHere
        ? fs.openSync(lockPath, fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_NOFOLLOW, 0o600)
        : Number(inherited);
    let ownsFd = openedHere;
    try {
        if (!Number.isSafeInteger(fd) || fd < 3) throw Error('invalid_run_lock_fd');
        const open = fs.fstatSync(fd, { bigint: true });
        const named = fs.lstatSync(lockPath, { bigint: true });
        if (!open.isFile() || !named.isFile() || open.dev !== named.dev || open.ino !== named.ino)
            throw Error('invalid_run_lock_fd');
        ownsFd = true;
        // Node has no flock primitive. Python locks the same open file description
        // through its inherited descriptor. The lock survives until every copy closes.
        const lock = spawnSync('python3', ['-I', '-B', '-c',
            'import fcntl\nfcntl.flock(3, fcntl.LOCK_EX | fcntl.LOCK_NB)'],
        { stdio: ['ignore', 'ignore', 'ignore', fd] });
        if (lock.error || lock.signal) throw Error('run_lock_unavailable');
        if (lock.status !== 0) throw Error('run_directory_locked');
        return { fd, close: () => fs.closeSync(fd) };
    } catch (error) {
        if (ownsFd) fs.closeSync(fd);
        throw error;
    }
}

module.exports = { acquireRunLock, externalRunDirectory, LOCK_FD_ENV };
