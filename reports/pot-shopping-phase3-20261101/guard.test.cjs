'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), cp = require('node:child_process'), path = require('node:path');
const child = path.join(__dirname, 'guard-child.cjs');
function run(scenario) {
    const env = { ...process.env, POT_LIVE_PROJECT_ID: 'pivota-prod', POT_SHOPPING_MODEL_ARM: 'L', POT_LIVE_PROXY: '127.0.0.1:7897' };
    delete env.NODE_TEST_CONTEXT;
    const r = cp.spawnSync(process.execPath, [child, scenario], { env, encoding: 'utf8', timeout: 20000 });
    const line = r.stdout.split('\n').find(s => s.startsWith('{') && !s.includes('strict_network_guard_audit'));
    assert.ok(line, 'child result missing: ' + JSON.stringify(r.stdout.slice(0, 300)) + ' ' + r.stderr.slice(-300));
    return { status: r.status, result: JSON.parse(line), stdout: r.stdout, stderr: r.stderr };
}
test('model eval guard: an abort during the response body leaves no uncaught error and the next request works', () => {
    const { status, result } = run('abort-mid-body');
    assert.equal(result.harness_error, undefined);
    assert.match(result.body_outcome, /^rejected/);
    assert.equal(result.stopped_after_late_errors, false);
    assert.equal(result.runtime_failures, 0);
    assert.equal(result.stop_reason, null);
    assert.ok(result.late_errors >= 3, 'late errors are recorded, not raised');
    assert.deepEqual(result.next, { ok: true });
    assert.equal(result.allowed_requests, 2);
    assert.equal(result.tls_connections, 2);
    assert.equal(status, 0);
});
test('model eval guard: the fatal handler records a sanitized error and still stops', () => {
    const { status, result, stdout, stderr } = run('fatal-record');
    assert.equal(status, 1);
    assert.equal(result.stopped, true);
    assert.equal(result.stop_reason, 'live_runtime_failure');
    assert.ok(result.failure, 'runtime failure recorded');
    assert.equal(result.failure.name, 'Error');
    assert.equal(result.failure.code, 'E_FIXTURE');
    assert.ok(result.failure.message.startsWith('boom Bearer [redacted]'));
    assert.ok(result.failure.message.length <= 200);
    assert.ok(result.failure.frames.length > 0 && result.failure.frames.every(f => /^[^/\\\s]+\.c?js:\d+$/.test(f)));
    for (const secret of ['abc.defsecret', 'SECRETTOKEN', 's3cret'])
        assert.equal((stdout + stderr).includes(secret), false, secret);
    assert.ok(stderr.includes('"live_runtime_failure":{'));
});
