'use strict';
// Phase-3 harness test for live-host.cjs; it lives beside the code it tests, outside tests/.
const test = require('node:test'), assert = require('node:assert/strict');
test('model eval harness fix: each plan launches only with its own go string, before any token read', async () => {
    const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
    const { main, REVIEW_GO } = require('./live-host.cjs');
    const { hash } = require('../../src/lib/pokemon/shopping/schema.cjs');
    const freezeHash = hash(fs.readFileSync(path.join(__dirname, 'freeze.json'), 'utf8'));
    const raw = fs.mkdtempSync(path.join(os.tmpdir(), 'shopping-go-fixture-'));
    const saved = { go: process.env.POT_SHOPPING_REVIEW_GO, expires: process.env.POT_LIVE_TOKEN_EXPIRES_AT };
    delete process.env.POT_LIVE_TOKEN_EXPIRES_AT;
    try {
        assert.deepEqual(REVIEW_GO, { smoke: 'claude_3c_smoke_go', reduced: 'claude_3c_reduced_go', compatibility: 'claude_3c_compat_go', heldout: 'claude_4_heldout_go' });
        for (const [plan, go] of [['smoke', 'claude_3c_reduced_go'], ['reduced', 'claude_3c_smoke_go'], ['smoke', 'claude_3a_go'], ['reduced', 'claude_3a_go'], ['smoke', undefined], ['compatibility', 'claude_3c_reduced_go'], ['reduced', 'claude_3c_compat_go'], ['compatibility', 'claude_3c_smoke_go']]) {
            if (go === undefined) delete process.env.POT_SHOPPING_REVIEW_GO; else process.env.POT_SHOPPING_REVIEW_GO = go;
            await assert.rejects(main('L', raw, freezeHash, plan), /claude_exact_freeze_review_required/, plan + ' with ' + go);
        }
        process.env.POT_SHOPPING_REVIEW_GO = 'claude_3c_smoke_go';
        await assert.rejects(main('L', raw, freezeHash, 'bogus'), /exact_plan_required/);
        await assert.rejects(main('L', raw, 'f'.repeat(64), 'smoke'), /claude_exact_freeze_review_required/);
        // The right go and freeze pass the gate and stop at the token rule, before stdin is read.
        for (const plan of ['smoke', 'reduced', 'compatibility']) {
            process.env.POT_SHOPPING_REVIEW_GO = REVIEW_GO[plan];
            await assert.rejects(main('L', raw, freezeHash, plan), /cached_token_requires_45_minutes/, plan);
        }
    }
    finally {
        if (saved.go === undefined) delete process.env.POT_SHOPPING_REVIEW_GO; else process.env.POT_SHOPPING_REVIEW_GO = saved.go;
        if (saved.expires !== undefined) process.env.POT_LIVE_TOKEN_EXPIRES_AT = saved.expires;
        fs.rmSync(raw, { recursive: true, force: true });
    }
});
