'use strict';
// Lazy, disabled stage3b host. Stage3a never invokes main or reads token stdin.
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.resolve(__dirname, '../..');
async function main(arm, raw, reviewHash) {
    const { hash } = require(ROOT + '/src/lib/pokemon/shopping/schema.cjs'), bytes = fs.readFileSync(__dirname + '/freeze.json', 'utf8'), freeze = JSON.parse(bytes);
    if (process.env.POT_SHOPPING_REVIEW_GO !== 'claude_3a_go' || reviewHash !== hash(bytes))
        throw Error('claude_exact_freeze_review_required');
    if (!['L', 'P'].includes(arm))
        throw Error('exact_arm_required');
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
    const request = createVertexRequest({ arm, guard, token }), collector = createCollector({ freeze, artifactBytes: p => fs.readFileSync(ROOT + '/' + p), checkpoint: directory + '/checkpoint.json', tokenExpiresAt: expires, reviewGo: true, transport: ({ request: body, signal }) => request(body, { signal }) });
    try {
        await runArm(collector, arm);
    }
    finally {
        collector.close();
    }
}
if (require.main === module) {
    if (process.argv[2] !== '--live')
        throw Error('explicit_reviewed_live_mode_required');
    main(process.argv[3], process.argv[4], process.argv[5]).catch(() => { process.stderr.write('evaluation_host_stopped\n'); process.exitCode = 1; });
}
module.exports = { main };
