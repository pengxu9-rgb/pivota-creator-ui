'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),freeze=require('./freeze.json');
const base=JSON.parse(cp.execFileSync('git',['show','3aa30d44bca48a84f4254af7465ba002ce905fe3:reports/pot-shopping-phase3-20261101/freeze.json'],{cwd:root,encoding:'utf8'}));
const unchanged=['models','endpoints','prices','generationConfig','toolConfig','system_instruction_sha256','declaration_set_sha256','dropped_schema_keywords','privacy_projection_sha256','privacy_policy','fixture_manifest_sha256','compatibility_mapping_sha256','turn_limits'];
for(const key of unchanged)assert.deepEqual(freeze[key],base[key],key);
for(const file of ['src/lib/pokemon/shopping/model/turn.cjs','reports/pot-shopping-phase3-20261101/declarations.json','tests/fixtures/shopping-model-eval/compatibility-mapping.json','reports/pot-shopping-phase3-20261101/vertex-allowlist-guard.cjs']){
 // Turn-loop source is entirely unchanged; caller-only provenance lives in the harness.
 assert.equal(fs.readFileSync(root+'/'+file,'utf8'),cp.execFileSync('git',['show','3aa30d4:'+file],{cwd:root,encoding:'utf8'}),file);
}
assert.equal(freeze.corpus_plan.compatibility.enabled,false);assert.equal(freeze.corpus_plan.compatibility.passes_per_arm,0);assert.equal(freeze.corpus_plan.journeys.length,4);assert.ok(freeze.corpus_plan.journeys.every(j=>j.repetitions===10));assert.equal(freeze.corpus_plan.adversarial.ids.length,12);assert.equal(freeze.corpus_plan.faults.ids.length,6);assert.equal(freeze.stop_rules.request_rejected.consecutive_non_429_4xx,3);
const result={passed:true,baseline:'3aa30d44bca48a84f4254af7465ba002ce905fe3',unchanged_fields:unchanged,compatibility_enabled:false,phase2_manifest:freeze.fixture_manifest_sha256,freeze_sha256:crypto.createHash('sha256').update(fs.readFileSync(__dirname+'/freeze.json')).digest('hex')};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result)+'\n');
