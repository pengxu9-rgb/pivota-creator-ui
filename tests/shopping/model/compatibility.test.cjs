'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const mapping = require('../../fixtures/shopping-model-eval/compatibility-mapping.json');
const { createVertexRequest } = require('../../../src/lib/pokemon/shopping/model/vertex-request.cjs');
const { endpoint } = require('../../../src/lib/pokemon/shopping/model/collector.cjs');
test('model eval mapping: all389 contexts and34 expressible rows stay frozen for two passes', () => { assert.equal(mapping.entries.length, 389); assert.equal(new Set(mapping.entries.map(e => e.id)).size, 389); assert.equal(mapping.entries.filter(e => e.expressible).length, 34); assert.equal(mapping.entries.filter(e => e.dynamic).length, 18); assert.equal(mapping.counts.passes_per_arm, 2); assert.ok(mapping.context_policy.includes('actual arm/pass predecessor')); assert.ok(mapping.entries.every(e => e.original_input_sha256.length === 64 && e.frozen_context_sha256.length === 64)); });
test('model eval Vertex port: only exact endpoint and injected fake credentials; no socket or cache', async () => { for (const arm of ['L', 'P']) {
    const seen = [], request = createVertexRequest({ arm, token: 'FAKE_TOKEN_FIXTURE', guard: { endpoint: endpoint(arm), auditSnapshot: () => ({ events: [{ sequence: 1, kind: 'allowed_request' }, { sequence: 2, request_id: 1, kind: 'tls_connected', authorized: true }, { sequence: 3, request_id: 1, kind: 'http_status' }] }), fetchImpl: async (url, options) => { seen.push({ url, options }); return { status: 200, json: async () => ({ synthetic: true }) }; } } });
    assert.equal((await request({ contents: [] })).status, 200);
    assert.equal(seen[0].url, endpoint(arm));
    assert.equal(seen[0].options.redirect, 'error');
    assert.equal(seen[0].options.headers.authorization, 'Bearer FAKE_TOKEN_FIXTURE');
} assert.throws(() => createVertexRequest({ arm: 'P', token: 'FAKE', guard: { endpoint: endpoint('L'), fetchImpl: async () => { } } }), /invalid_vertex_port/); });
test('model eval Vertex port: request-specific TLS stages survive success and thrown timeout', async () => { for (const throws of [false, true]) {
    const events = [];
    let sequence = 0;
    const guard = { endpoint: endpoint('L'), auditSnapshot: () => ({ events: structuredClone(events) }), fetchImpl: async () => { const id = ++sequence; events.push({ sequence: id, kind: 'allowed_request' }, { sequence: ++sequence, request_id: id, kind: 'tls_connected', authorized: true }); if (throws)
            throw Object.assign(Error('fixture timeout'), { code: 'ABORT_ERR' }); events.push({ sequence: ++sequence, request_id: id, kind: 'http_status' }); return { status: 200, json: async () => ({ synthetic: true }) }; } };
    const request = createVertexRequest({ arm: 'L', guard, token: 'FAKE_TOKEN_FIXTURE' });
    if (throws)
        await assert.rejects(request({ contents: [] }), e => e.tls_connected === true && e.stage_reached === 'tls_connected' && e.code === 'timeout');
    else {
        const r = await request({ contents: [] });
        assert.equal(r.tls_connected, true);
        assert.equal(r.stage_reached, 'http_status');
    }
} });
