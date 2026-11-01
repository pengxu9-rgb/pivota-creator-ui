'use strict';
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../..'), raw = process.argv[2], { createCollector, atomic } = require(ROOT + '/src/lib/pokemon/shopping/model/collector.cjs');
const { shoppingEpisode } = require('./orchestrate.cjs'), { journeys } = require(ROOT + '/tests/shopping/helpers.cjs');
const freeze = require('./freeze.json');
let transportCalls = 0;
const transport = async ({ request }) => { transportCalls++; const first = JSON.parse(request.contents[0].parts[0].text), continued = request.contents.some(c => c.role === 'model'); const parts = continued ? [{ text: '{"decision":"search","fields":[],"claims":[]}' }] : [{ functionCall: { name: 'search_catalog', args: { task_ref: first.task_ref, text: first.text }, id: 'fixture_call' }, thoughtSignature: 'fixture_signature' }]; return { status: 200, tls_connected: true, stage_reached: 'http_status', body: { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10, thoughtsTokenCount: 2 }, candidates: [{ finishReason: 'STOP', content: { parts } }] } }; };
const c = createCollector({ freeze, artifactBytes: p => fs.readFileSync(ROOT + '/' + p), checkpoint: raw + '/checkpoint.json', tokenExpiresAt: Date.now() + 3600000, rehearsal: true, transport });
(async () => { for (const arm of ['L', 'P']) {
    const result = await shoppingEpisode(c, arm, 'detached/J01', journeys.journeys[0]);
        const prior=c.priorOutcome(arm,'detached/J01');
        if(prior){const assert=require('node:assert/strict'),left=structuredClone(prior),right=structuredClone(result);delete left.latency_ms;delete right.latency_ms;assert.deepEqual(left,right,'Replay must preserve facade state/outcome; original latency stays immutable.');}
        else c.outcome(arm, 'detached/J01', result);
} c.close(); const previous = fs.existsSync(raw + '/done.json') ? JSON.parse(fs.readFileSync(raw + '/done.json')) : null; atomic(raw + '/done.json', { fake: true, run: (previous?.run || 0) + 1, transport_calls_this_run: transportCalls, records: c.state().records.length, completed_episodes: c.state().outcomes.length, model_calls: 0, real_tokens: 0, real_spend_usd: 0 }); })().catch(() => { c.close(); process.exitCode = 1; });
