'use strict';
// Phase-3 harness test: the journey host shows the model what the interface showed the user.
const test = require('node:test'), assert = require('node:assert/strict');
const { shoppingEpisode } = require('./orchestrate.cjs');
const { journeys } = require('../../tests/shopping/helpers.cjs');
function fakeCollector() {
    const requests = [];
    const answer = { status: 200, tls_connected: true, body: { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }, candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"decision":"answer","fields":[],"claims":[]}' }] } }] } };
    return {
        requests,
        channel: () => Object.defineProperty(async request => { requests.push(request); return answer; }, 'elapsedMs', { value: () => 0 }),
        session: () => ({ elapsed: () => 0, observe: (kind, ms = 0) => ms }),
        outcome: (arm, id, result) => result
    };
}
const screenOf = request => JSON.parse(request.contents[0].parts[0].text).context.filter(c => c.shown_in_interface === true).flatMap(c => c.records.map(r => r.kind));
test('model eval host: the first J04 turn sees the selection and preview the user already made', async () => {
    const c = fakeCollector(), j = journeys.journeys.find(x => x.id === 'J04');
    const episode = await shoppingEpisode(c, 'L', 'journey/J04/1', j);
    assert.equal(episode.completed, true);
    const first = screenOf(c.requests[0]);
    assert.ok(first.includes('selection') && first.includes('preview'), JSON.stringify(first));
    for (const secret of ['dest_hk', 'human_action_ref', 'approval_ref'])
        assert.equal(JSON.stringify(c.requests).includes(secret), false, secret);
});
test('model eval host: in J01 the preview turn sees the selection and comparison, and nothing is shown twice', async () => {
    const c = fakeCollector(), j = journeys.journeys.find(x => x.id === 'J01');
    await shoppingEpisode(c, 'L', 'journey/J01/1', j);
    const last = c.requests.at(-1), kinds = screenOf(last);
    assert.ok(kinds.includes('selection'), JSON.stringify(kinds));
    assert.ok(kinds.includes('offer'), JSON.stringify(kinds));
    const parts = last.contents[0].parts.length;
    assert.equal(parts, 1, 'the screen travels in the context snapshot only');
});
