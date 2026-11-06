'use strict';
// Lazy, disabled stage3b host. Stage3a never invokes main or reads token stdin.
const fs = require('node:fs'), path = require('node:path');
const { createHash } = require('node:crypto');
const ROOT = path.resolve(__dirname, '../..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Each plan has its own go; a go for one plan never launches the other.
const REVIEW_GO = Object.freeze({ smoke: 'claude_3c_smoke_go', reduced: 'claude_3c_reduced_go', compatibility: 'claude_3c_compat_go', heldout: 'claude_4_heldout_go' });

function verifyFrozenArtifacts(freeze) {
    if (freeze.stage !== '3a' || freeze.live_run_enabled !== false || !Array.isArray(freeze.artifacts))
        throw Error('invalid_freeze');
    const entries = new Set();
    for (const { path: relative, sha256: expected } of freeze.artifacts) {
        if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split('/').includes('..') || entries.has(relative))
            throw Error('invalid_frozen_artifact_path');
        if (sha256(fs.readFileSync(path.join(ROOT, relative))) !== expected)
            throw Error('frozen_artifact_mismatch:' + relative);
        entries.add(relative);
    }
    for (const required of ['live-host.cjs', 'run-directory.cjs', 'validate-heldout.cjs', 'vertex-allowlist-guard.cjs']) {
        if (!entries.has('reports/pot-shopping-phase3-20261101/' + required))
            throw Error('frozen_artifact_required:' + required);
    }
}

async function main(arm, raw, reviewHash, plan, heldoutPath) {
    const bytes = fs.readFileSync(__dirname + '/freeze.json');
    const freeze = JSON.parse(bytes);
    if (!Object.hasOwn(REVIEW_GO, plan) || freeze.review_go?.[plan] !== REVIEW_GO[plan])
        throw Error('exact_plan_required');
    if (process.env.POT_SHOPPING_REVIEW_GO !== REVIEW_GO[plan] || reviewHash !== sha256(bytes))
        throw Error('claude_exact_freeze_review_required');
    if (!['L', 'P'].includes(arm))
        throw Error('exact_arm_required');
    if(plan==='heldout'&&arm!=='L')throw Error('heldout_is_L_only');
    if (plan === 'heldout' && (!freeze.heldout_fixture || !heldoutPath))
        throw Error('bound_heldout_required');
    verifyFrozenArtifacts(freeze);
    const expires = Date.parse(process.env.POT_LIVE_TOKEN_EXPIRES_AT);
    if (!(expires >= Date.now() + 45 * 60000))
        throw Error('cached_token_requires_45_minutes');
    const { acquireRunLock, externalRunDirectory } = require('./run-directory.cjs');
    const directory = externalRunDirectory(ROOT, raw);
    const lock = acquireRunLock(directory);
    let guard;
    try {
        process.env.POT_LIVE_PROJECT_ID = 'pivota-prod';
        process.env.POT_SHOPPING_MODEL_ARM = arm;
        guard = require('./vertex-allowlist-guard.cjs');
        const heldout = plan === 'heldout'
            ? await require('./validate-heldout.cjs').loadQualified(heldoutPath, { expected: freeze.heldout_fixture })
            : undefined;
        // The user-owned cached token is supplied on stdin after validation and locking.
        const token = fs.readFileSync(0, 'utf8').trim();
        if (!/^[A-Za-z0-9._~+\/-]+=*$/.test(token) || token.length < 16 || token.length > 16384)
            throw Error('invalid_token_handoff');
        const { createVertexRequest } = require(ROOT + '/src/lib/pokemon/shopping/model/vertex-request.cjs');
        const { createCollector } = require(ROOT + '/src/lib/pokemon/shopping/model/collector.cjs');
        const { runArm } = require('./orchestrate.cjs');
        const request = createVertexRequest({ arm, guard, token });
        const collector = createCollector({
            freeze, artifactBytes: p => fs.readFileSync(ROOT + '/' + p),
            checkpoint: directory + '/checkpoint.json', tokenExpiresAt: expires,
            reviewGo: true, plan, transport: ({ request: body, signal, onStageReader }) =>
                request(body, { signal, onStageReader })
        });
        try {
            await runArm(collector, arm, { plan, heldout });
        } finally {
            collector.close();
        }
    } finally {
        try { guard?.abortAll('collector_closed'); } finally { lock.close(); }
    }
}
if (require.main === module) {
    if (process.argv[2] !== '--live')
        throw Error('explicit_reviewed_live_mode_required');
    main(process.argv[3], process.argv[4], process.argv[5], process.argv[6], process.argv[7]).catch(() => { process.stderr.write('evaluation_host_stopped\n'); process.exitCode = 1; });
}
module.exports = { main, REVIEW_GO };
