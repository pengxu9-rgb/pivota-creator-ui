'use strict';
// Child fixture for guard.test.cjs (phase-3 harness tests, run beside tests/shopping-model-eval.test.cjs). Installs in-memory socket, TLS and HTTPS fakes
// before loading the guard, so no byte reaches a network. Prints one JSON result line.
const { EventEmitter } = require('node:events'), { Readable } = require('node:stream');
const net = require('node:net'), tls = require('node:tls'), https = require('node:https');
// A piped stdout is created lazily as a net.Socket, so create both streams before the fakes.
void process.stdout; void process.stderr;
const handles = { sockets: [], transports: [], requests: [], responses: [] };
let mode = 'complete';
function destroyable(emitter) {
    emitter.destroyed = false;
    emitter.destroy = function (error) {
        if (this.destroyed)
            return this;
        this.destroyed = true;
        process.nextTick(() => { if (error) this.emit('error', error); this.emit('close'); });
        return this;
    };
    return emitter;
}
class FakeSocket extends EventEmitter {
    constructor() { super(); destroyable(this); handles.sockets.push(this); }
    connect() { setImmediate(() => this.emit('connect')); return this; }
    write() { setImmediate(() => this.emit('data', Buffer.from('HTTP/1.1 200 Connection established\r\n\r\n'))); return true; }
    pause() { return this; }
    unshift() { }
}
net.Socket = FakeSocket;
tls.connect = () => {
    const transport = destroyable(new EventEmitter());
    transport.authorized = true;
    transport.getPeerCertificate = () => ({ issuer: { CN: 'Fixture CA' } });
    handles.transports.push(transport);
    setImmediate(() => transport.emit('secureConnect'));
    return transport;
};
https.request = (options, onResponse) => {
    const request = destroyable(new EventEmitter());
    handles.requests.push(request);
    request.end = () => {
        options.agent.createConnection({ host: options.hostname, port: options.port }, (error) => {
            if (error)
                return request.emit('error', error);
            const response = new Readable({ read() { } });
            response.statusCode = 200;
            response.headers = { 'content-type': 'application/json' };
            handles.responses.push(response);
            const destroyRequest = request.destroy.bind(request);
            request.destroy = err => { response.destroy(err); return destroyRequest(err); };
            onResponse(response);
            if (mode === 'complete') {
                response.push('{"ok":true}');
                response.push(null);
            }
            else
                response.push('{"candidates":'); // stalls mid-body until aborted
        });
    };
    return request;
};
const guard = require('./vertex-allowlist-guard.cjs');
const options = signal => ({ method: 'POST', redirect: 'error', body: '{}', headers: { authorization: 'Bearer fixturetokenvalue', 'content-type': 'application/json' }, signal });
const later = ms => new Promise(resolve => setTimeout(resolve, ms));
function print(result) { process.stdout.write(JSON.stringify(result) + '\n'); }
async function abortMidBody() {
    mode = 'stall';
    const controller = new AbortController();
    const response = await guard.fetchImpl(guard.endpoint, options(controller.signal));
    const body = response.text().then(() => 'resolved', error => 'rejected:' + (error?.code || error?.name));
    await later(10);
    controller.abort();
    const outcome = await body;
    await later(10);
    // Late errors on every handle of the aborted request, from timer callbacks as in production.
    const lateTargets = [handles.sockets[0], handles.transports[0], handles.requests[0], handles.responses[0]];
    for (const handle of lateTargets)
        setImmediate(() => handle.emit('error', Object.assign(new Error('late'), { code: 'ECONNRESET' })));
    await later(30);
    const afterLate = guard.auditSnapshot();
    mode = 'complete';
    let next;
    try {
        next = await (await guard.fetchImpl(guard.endpoint, options())).json();
    }
    catch (error) {
        next = { failed: error?.code || String(error) };
    }
    const snapshot = guard.auditSnapshot();
    print({ body_outcome: outcome, stopped_after_late_errors: afterLate.stopped, stop_reason: snapshot.stop_reason, late_errors: snapshot.events.filter(e => e.kind === 'late_handle_error').length, runtime_failures: snapshot.events.filter(e => e.kind === 'runtime_failure').length, next, allowed_requests: snapshot.allowed_requests, tls_connections: snapshot.tls_connections });
}
async function fatalRecord() {
    Promise.reject(Object.assign(new Error('boom Bearer abc.defsecret ya29.SECRETTOKEN https://example.test/x?key=s3cret'), { code: 'E_FIXTURE' }));
    await later(20);
    const snapshot = guard.auditSnapshot();
    print({ stopped: snapshot.stopped, stop_reason: snapshot.stop_reason, failure: snapshot.events.find(e => e.kind === 'runtime_failure') || null });
}
({ 'abort-mid-body': abortMidBody, 'fatal-record': fatalRecord })[process.argv[2]]().catch(error => { print({ harness_error: String(error?.stack || error) }); process.exitCode = 2; });
