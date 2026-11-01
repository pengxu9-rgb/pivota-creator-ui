'use strict';
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'), original = fs.readFileSync(root + '/reports/admission-kernel-live-model/live-allowlist-guard.cjs', 'utf8'), actual = fs.readFileSync(__dirname + '/vertex-allowlist-guard.cjs', 'utf8');
let expected = original.replace('// Phase A only: one verified TLS destination through one fixed CONNECT proxy.', '// Evaluation only: original attempt4 CONNECT implementation, selected exact arm.').replace("if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project||''))throw Error('live_project_id_required');", "if(project!=='pivota-prod')throw Error('live_project_id_required');").replace("const endpoint='https://'+HOST+'/v1/projects/'+project+'/locations/global/publishers/google/models/gemini-3.5-flash-lite:generateContent';", "const models=Object.freeze({L:'gemini-3.5-flash-lite',P:'gemini-3.1-pro-preview'}),model=models[process.env.POT_SHOPPING_MODEL_ARM];\nif(!model)throw Error('exact_shopping_arm_required');\nconst endpoint='https://'+HOST+'/v1/projects/'+project+'/locations/global/publishers/google/models/'+model+':generateContent';");
assert.equal(actual, expected, 'CONNECT/TLS implementation must remain byte-identical after exact endpoint projection');
const rows = [];
for (const arm of ['L', 'P']) {
    const code = "const assert=require('node:assert/strict'),g=require('./reports/pot-shopping-phase3-20261101/vertex-allowlist-guard.cjs');assert.equal(g.auditSnapshot().allowed_requests,0);assert.equal(g.auditSnapshot().tls_connections,0);process.stdout.write(g.endpoint+'\\n');";
    const r = cp.spawnSync(process.execPath, ['-e', code], { cwd: root, env: { ...process.env, POT_LIVE_PROJECT_ID: 'pivota-prod', POT_SHOPPING_MODEL_ARM: arm }, encoding: 'utf8' });
    fs.writeFileSync(process.argv[2] + '/' + arm + '.log', r.stdout + '\n' + r.stderr);
    assert.equal(r.status, 0);
    assert.ok(r.stderr.includes('"allowed_requests":0'));
    assert.ok(r.stderr.includes('"count":0'));
    rows.push({ arm, exit_code: r.status, model_calls: 0, network_attempts: 0 });
}
process.stdout.write(JSON.stringify({ original_CONNECT_TLS_unchanged: true, rows }) + '\n');
