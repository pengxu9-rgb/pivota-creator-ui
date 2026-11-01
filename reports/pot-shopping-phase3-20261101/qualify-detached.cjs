'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), raw = path.resolve(process.argv[2]);
fs.mkdirSync(raw, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(run) { for (let i = 0; i < 100; i++) {
    if (fs.existsSync(raw + '/done.json')) {
        const d = JSON.parse(fs.readFileSync(raw + '/done.json'));
        if (d.run === run)
            return d;
    }
    await delay(100);
} throw Error('detached_fake_timeout'); }
(async () => { let first; for (const run of [1, 2]) {
    const launch = cp.spawnSync(process.execPath, [__dirname + '/detached-launch.cjs', '--fake', raw], { cwd: root, env: process.env, encoding: 'utf8' });
    assert.equal(launch.status, 0);
    fs.writeFileSync(raw + '/launch-' + run + '.log', launch.stdout + '\n' + launch.stderr);
    const done = await wait(run);
    assert.equal(done.completed_episodes, 2);
    if (run === 1) {
        assert.ok(done.transport_calls_this_run > 0);
        first = done;
    }
    else {
        assert.equal(done.transport_calls_this_run, 0);
        assert.equal(done.records, first.records);
    }
} process.stdout.write(JSON.stringify({ detached: true, both_arms: true, completed_continuation_replayed_after_restart: true, duplicate_transport_calls: 0, model_calls: 0 }) + '\n'); })().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
