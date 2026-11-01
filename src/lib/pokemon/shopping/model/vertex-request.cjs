'use strict';
// Test-only function-calling HTTP adapter. It owns no sockets or credentials;
// reviewed host injects the exact CONNECT guard and a token. Qualification uses
// a fake guard and a fake token, never the real cache or network module.
const { endpoint, MODELS } = require('./collector.cjs');
function createVertexRequest({ arm, guard, token }) {
    if (!MODELS[arm] || guard?.endpoint !== endpoint(arm) || typeof guard.fetchImpl !== 'function' || typeof guard.auditSnapshot !== 'function' || typeof token !== 'string' || !token)
        throw Error('invalid_vertex_port');
    const fetch = guard.fetchImpl, uri = endpoint(arm), credential = token;
    return async (request, { signal } = {}) => {
        const before = guard.auditSnapshot().events.at(-1)?.sequence || 0;
        let requestId;
        function stage() { const events = guard.auditSnapshot().events.filter(e => e.request_id === requestId || e.kind === 'allowed_request' && e.sequence === requestId), tls = events.some(e => e.kind === 'tls_connected' && e.authorized === true), http = events.some(e => e.kind === 'http_status'); return { tls_connected: tls, stage_reached: http ? 'http_status' : tls ? 'tls_connected' : events.some(e => e.kind === 'tunnel_established') ? 'tunnel_established' : events.some(e => e.kind === 'proxy_connect') ? 'proxy_connect' : 'not_started' }; }
        try {
            const pending = fetch(uri, { method: 'POST', redirect: 'error', headers: { authorization: 'Bearer ' + credential, 'content-type': 'application/json' }, body: JSON.stringify(request), signal });
            requestId = guard.auditSnapshot().events.find(e => e.kind === 'allowed_request' && e.sequence > before)?.sequence;
            const response = await pending;
            let body = null;
            try {
                body = await response.json();
            }
            catch { }
            return { status: response.status, body, ...stage(), model_unavailable: response.status === 404, function_calling_unsupported: response.status === 400 && /function.{0,40}(?:unsupported|not supported)/i.test(body?.error?.message || '') };
        }
        catch (error) {
            throw Object.assign(Error(error.code === 'ABORT_ERR' ? 'timeout' : 'vertex_transport_error'), { code: error.code === 'ABORT_ERR' ? 'timeout' : 'transport_error', ...stage() });
        }
    };
}
module.exports = { createVertexRequest };
