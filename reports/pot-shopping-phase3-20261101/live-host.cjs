'use strict';
// Lazy, disabled stage3b host. Stage3a never invokes main or reads token stdin.
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
// Each plan has its own go; a go for one plan never launches the other.
const REVIEW_GO = Object.freeze({ smoke: 'claude_3c_smoke_go', reduced: 'claude_3c_reduced_go', compatibility: 'claude_3c_compat_go', heldout: 'claude_4_heldout_go' });
async function main(arm, raw, reviewHash, plan, heldoutPath) {
    const { hash } = require(ROOT + '/src/lib/pokemon/shopping/schema.cjs'), bytes = fs.readFileSync(__dirname + '/freeze.json', 'utf8'), freeze = JSON.parse(bytes);
    if (!Object.hasOwn(REVIEW_GO, plan) || freeze.review_go?.[plan] !== REVIEW_GO[plan])
        throw Error('exact_plan_required');
    if (process.env.POT_SHOPPING_REVIEW_GO !== REVIEW_GO[plan] || reviewHash !== hash(bytes))
        throw Error('claude_exact_freeze_review_required');
    if (!['L', 'P'].includes(arm))
        throw Error('exact_arm_required');
    if(plan==='heldout'&&arm!=='L')throw Error('heldout_is_L_only');
    let heldout;
    if(plan==='heldout'){
        if(!freeze.heldout_fixture||!heldoutPath)throw Error('bound_heldout_required');
        heldout=await require('./validate-heldout.cjs').loadQualified(heldoutPath,{expected:freeze.heldout_fixture});
    }
    const expires = Date.parse(process.env.POT_LIVE_TOKEN_EXPIRES_AT);
    if (!(expires >= Date.now() + 45 * 60000))
        throw Error('cached_token_requires_45_minutes');
    // Same attempt4 cached-token handoff: user-owned cached token supplied on stdin;
    // no refresh and no credential/cache lookup by this module.
    const token = fs.readFileSync(0, 'utf8').trim();
    if (!/^[A-Za-z0-9._~+\/-]+=*$/.test(token) || token.length < 16 || token.length > 16384)
        throw Error('invalid_token_handoff');
    const directory = fs.realpathSync(raw);
    if (directory === ROOT || directory.startsWith(ROOT + path.sep))
        throw Error('raw_evidence_must_be_external');
    process.env.POT_LIVE_PROJECT_ID = 'pivota-prod';
    process.env.POT_SHOPPING_MODEL_ARM = arm;
    const guard = require('./vertex-allowlist-guard.cjs'), { createVertexRequest } = require(ROOT + '/src/lib/pokemon/shopping/model/vertex-request.cjs'), { createCollector } = require(ROOT + '/src/lib/pokemon/shopping/model/collector.cjs'), { runArm } = require('./orchestrate.cjs');
    const request = createVertexRequest({ arm, guard, token }), collector = createCollector({ freeze, artifactBytes: p => fs.readFileSync(ROOT + '/' + p), checkpoint: directory + '/checkpoint.json', tokenExpiresAt: expires, reviewGo: true, plan, transport: ({ request: body, signal, onStageReader }) => request(body, { signal, onStageReader }) });
    try {
        await runArm(collector, arm, { plan, heldout });
    }
    finally {
        collector.close();
        guard.abortAll('collector_closed');
    }
}
if (require.main === module) {
    if (process.argv[2] !== '--live')
        throw Error('explicit_reviewed_live_mode_required');
    main(process.argv[3], process.argv[4], process.argv[5], process.argv[6], process.argv[7]).catch(() => { process.stderr.write('evaluation_host_stopped\n'); process.exitCode = 1; });
}
module.exports = { main, REVIEW_GO };
