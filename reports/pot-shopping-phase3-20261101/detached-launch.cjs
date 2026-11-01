'use strict';
// Fake-only launch qualification. There is no live CLI in stage 3a.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const ROOT = fs.realpathSync(path.resolve(__dirname, '../..'));
const { atomic } = require(ROOT + '/src/lib/pokemon/shopping/model/collector.cjs');
if (process.argv[2] !== '--fake')
    throw Error('stage3a_fake_only');
const raw = fs.realpathSync(process.argv[3]);
if (raw === ROOT || raw.startsWith(ROOT + path.sep))
    throw Error('raw_evidence_must_be_external');
const guard = ROOT + '/tests/helpers/strict-network-guard.cjs', fd = fs.openSync(raw + '/worker.log', 'a', 0o600);
const child = cp.spawn(process.execPath, ['--require', guard, __dirname + '/fake-worker.cjs', raw], { cwd: ROOT, detached: true, stdio: ['ignore', fd, fd], env: { ...process.env, NODE_OPTIONS: '--require=' + guard } });
atomic(raw + '/pid.json', { schema: 'shopping.phase3.fake-pid.v1', pid: child.pid, started_at: new Date().toISOString(), fake: true });
child.unref();
fs.closeSync(fd);
process.stdout.write(JSON.stringify({ pid: child.pid, fake: true }) + '\n');
