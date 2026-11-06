'use strict';
// Fake-only launch qualification. There is no live CLI in stage 3a.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const ROOT = fs.realpathSync(path.resolve(__dirname, '../..'));
const { atomic } = require(ROOT + '/src/lib/pokemon/shopping/model/collector.cjs');
const { acquireRunLock, externalRunDirectory, LOCK_FD_ENV, HANDOFF_BYTES_ENV } = require('./run-directory.cjs');
if (process.argv[2] !== '--fake')
    throw Error('stage3a_fake_only');
const raw = externalRunDirectory(ROOT, process.argv[3]);
const lock = acquireRunLock(raw);
try {
    const guard = ROOT + '/tests/helpers/strict-network-guard.cjs';
    const fd = fs.openSync(raw + '/worker.log', 'a', 0o600);
    try {
        const handoff = 'synthetic_handoff';
        const child = cp.spawn(process.execPath, ['--require', guard, __dirname + '/fake-worker.cjs', raw], {
            cwd: ROOT, detached: true, stdio: ['pipe', fd, fd, lock.fd],
            env: { ...process.env, NODE_OPTIONS: '--require=' + guard, [LOCK_FD_ENV]: '3', [HANDOFF_BYTES_ENV]: String(handoff.length) }
        });
        try {
            atomic(raw + '/pid.json', { schema: 'shopping.phase3.fake-pid.v1', pid: child.pid, started_at: new Date().toISOString(), fake: true });
        } catch (error) {
            child.stdin.end();
            throw error;
        }
        child.stdin.end(handoff);
        child.unref();
        process.stdout.write(JSON.stringify({ pid: child.pid, fake: true }) + '\n');
    } finally {
        fs.closeSync(fd);
    }
} finally {
    lock.close();
}
