'use strict';
// Proves the harness-fix freeze differs from Claude's reviewed freeze 320084c4 only as listed.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),freeze=require('./freeze.json');
const BASE='d0e951ac3bb266cc0535495d63049fa53b7796a8',BASE_FREEZE='320084c4c0e142cede2b172acc776fa44e2382966fe1e7e5884ba887010032c2';
const show=file=>cp.execFileSync('git',['show',BASE+':'+file],{cwd:root,encoding:'utf8'});
const baseBytes=show('reports/pot-shopping-phase3-20261101/freeze.json');
assert.equal(crypto.createHash('sha256').update(baseBytes).digest('hex'),BASE_FREEZE,'baseline must be the reviewed freeze');
const base=JSON.parse(baseBytes);
const unchanged=['models','endpoints','prices','price_evidence_sha256','pricing_rule','generationConfig','toolConfig','sampling_reason','sampling_limitation','dropped_schema_keywords','privacy_projection_sha256','privacy_policy','privacy_policy_sha256','fixture_manifest_sha256','compatibility_mapping_sha256','budgets','stop_rules','turn_limits','stage','live_run_enabled','base','schema'];
for(const key of unchanged)assert.deepEqual(freeze[key],base[key],key);
const changed=['corpus_plan','system_instruction_sha256','declaration_set_sha256','review_required','smoke_budgets','review_go','harness_fix'];
const keys=new Set([...Object.keys(freeze),...Object.keys(base)]);keys.delete('artifacts');
for(const key of keys)assert.ok(unchanged.includes(key)||changed.includes(key),'unlisted freeze field: '+key);
// The corpus plan only gains the smoke block.
const plan={...freeze.corpus_plan};delete plan.smoke;assert.deepEqual(plan,base.corpus_plan);
assert.deepEqual(freeze.corpus_plan.smoke,{arms:['L'],journey_repetitions:2,adversarial:false,faults:false,compatibility:false,scored:false});
// Declarations equal the reviewed ones with text removed from search_catalog and get_offers.
const oldDecl=JSON.parse(show('reports/pot-shopping-phase3-20261101/declarations.json')).declarations;
for(const d of oldDecl)if(['search_catalog','get_offers'].includes(d.name)){delete d.parameters.properties.text;d.parameters.required=d.parameters.required.filter(x=>x!=='text');}
assert.deepEqual(JSON.parse(fs.readFileSync(__dirname+'/declarations.json','utf8')).declarations,oldDecl);
assert.deepEqual(freeze.review_go,{smoke:'claude_3c_smoke_go',reduced:'claude_3c_reduced_go'});
assert.deepEqual(freeze.smoke_budgets,{...base.budgets,calls:80,calls_per_arm:80,input_tokens:2000000,usd:1,usd_per_arm:{L:1,P:0}});
// The compatibility mapping is untouched; the guard is checked by qualify-guard's listed edits.
assert.equal(fs.readFileSync(root+'/tests/fixtures/shopping-model-eval/compatibility-mapping.json','utf8'),show('tests/fixtures/shopping-model-eval/compatibility-mapping.json'));
assert.equal(freeze.corpus_plan.compatibility.enabled,false);assert.equal(freeze.corpus_plan.journeys.length,4);assert.ok(freeze.corpus_plan.journeys.every(j=>j.repetitions===10));assert.equal(freeze.corpus_plan.adversarial.ids.length,12);assert.equal(freeze.corpus_plan.faults.ids.length,6);
const result={passed:true,baseline_commit:BASE,baseline_freeze:BASE_FREEZE,unchanged_fields:unchanged,changed_fields:changed,declarations:'reviewed minus text on search_catalog and get_offers',phase2_manifest:freeze.fixture_manifest_sha256,freeze_sha256:crypto.createHash('sha256').update(fs.readFileSync(__dirname+'/freeze.json')).digest('hex')};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify(result)+'\n');
