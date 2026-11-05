'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os');
const path=require('node:path'),{createHash}=require('node:crypto');
const R='../../../reports/pot-shopping-phase3-20261101/';
const {training,questionMeasure,ROOT}=require(R+'journey-data.cjs'),{validate,load}=require(R+'validate-heldout.cjs');
const {questionMeasures,scoreHeldout,score}=require('../../../src/lib/pokemon/shopping/model/scoring.cjs');
const {HELDOUT_BUDGETS}=require('../../../src/lib/pokemon/shopping/model/collector.cjs');
const catalog=require('../../fixtures/shopping/catalog.json');
function valid(set=structuredClone(training),cat=structuredClone(catalog)){return validate(set,{[training.journeys[0].catalog]:cat});}
function standinSet() {
 const set=structuredClone(training);
 set.journeys=[set.journeys[1]];
 return set;
}
function validateStandin(set,cat=catalog) {
 return validate(set,{[set.journeys[0].catalog]:cat},{heldout:true});
}
test('heldout: v2 references, steps, supply spans and synthetic boundaries are checked',()=>{
 assert.equal(valid().journeys,4);
 const edits=[s=>s.schema='v1',s=>s.journeys[0].required_fields=['missing'],s=>s.journeys[0].steps=[],s=>s.journeys[0].steps[0].supplies.language='not in text',s=>s.journeys[0].steps.push({interface:'approve_purchase'}),s=>s.journeys[0].offer_ref='unknown',s=>s.journeys[0].steps.find(s=>s.interface==='compare_offers').offer_refs=['unknown']];
 for(const edit of edits){const s=structuredClone(training);edit(s);assert.throws(()=>valid(s));}
 for(const edit of [c=>c.synthetic=false,c=>c.offers[0].url='https://evil.example/x',c=>c.offers[0].source_ref='missing',c=>c.offers[0].evidence_ref=c.sellers[0].evidence_ref,c=>c.offers[0].certificate_ref='missing',c=>c.certificate.printing_ref='missing',c=>c.destinations[0].synthetic=false,c=>c.offers[0].synthetic=false]){const c=structuredClone(catalog);edit(c);assert.throws(()=>valid(undefined,c));}
});
test('heldout: validation requires a model turn and an approvable final preview in the right phase',()=>{
 assert.equal(validateStandin(standinSet()).journeys,1);
 const edits=[
  j=>j.steps.unshift({interface:'get_operation'}),
  j=>j.steps.push(structuredClone(j.steps.find(s=>s.interface==='select'))),
  j=>{for(const step of j.steps)if(Object.hasOwn(step,'user'))step.model=false;},
  j=>{j.after_approval=[{user:'Check the result'}];},
  j=>j.steps.unshift({interface:'fault',name:'timeout_after_submit'})
 ];
 for(const edit of edits){
  const set=standinSet();
  edit(set.journeys[0]);
  assert.throws(()=>validateStandin(set),/invalid_synthetic_journey_set/);
 }
});
test('heldout: source and offer URLs cannot bypass synthetic HTTPS checks',()=>{
 for(const url of ['HTTPS://external.example/item','ftp://example.invalid/item',
  'HTTPS://example.invalid:444/item','HTTPS://user@example.invalid/item']){
  for(const field of ['source_url','url']){
   const cat=structuredClone(catalog);
   cat.offers[0][field]=url;
   assert.throws(()=>validateStandin(standinSet(),cat),/invalid_synthetic_journey_set/);
  }
 }
 const set=standinSet();
 set.journeys[0].transcript+=' HTTPS://external.example/item';
 assert.throws(()=>validateStandin(set),/invalid_synthetic_journey_set/);
});
test('heldout: binding hashes exact valid bytes and rejects malformed UTF-8',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heldout-binding-'));
 try{
  const set=standinSet(),file=path.join(dir,'journeys.json'),catalogFile=path.join(dir,'catalog.json');
  set.journeys[0].catalog='catalog.json';
  const catalogBytes=Buffer.from(JSON.stringify(catalog)+'\n');
  const journeyBytes=Buffer.from(JSON.stringify(set)+'\n');
  fs.writeFileSync(catalogFile,catalogBytes);
  fs.writeFileSync(file,journeyBytes);
  const expected=load(file).binding;
  const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
  assert.equal(expected.journeys_sha256,sha256(journeyBytes));
  assert.equal(expected.catalog_bindings[0].sha256,sha256(catalogBytes));
  fs.writeFileSync(file,Buffer.concat([journeyBytes,Buffer.from(' ')]));
  assert.throws(()=>load(file,{expected}),/invalid_synthetic_journey_set/);

  const invalidNote=Buffer.concat([Buffer.from('{"note":"'),Buffer.from([0x80]),
   Buffer.from('",'+journeyBytes.toString('utf8').slice(1))]);
  fs.writeFileSync(file,invalidNote);
  assert.throws(()=>load(file),{code:'ERR_ENCODING_INVALID_ENCODED_DATA'});
  fs.writeFileSync(file,journeyBytes);
  const invalidCatalog=Buffer.concat([Buffer.from('{"note":"'),Buffer.from([0x81]),
   Buffer.from('",'+catalogBytes.toString('utf8').slice(1))]);
  fs.writeFileSync(catalogFile,invalidCatalog);
  assert.throws(()=>load(file),{code:'ERR_ENCODING_INVALID_ENCODED_DATA'});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('heldout: M1 uses answer key once and M2 latches missed fields before selection or preview',()=>{
 const j={answer_key:{language:'English',budget:'50',grade:'raw'},required_fields:['language','budget','grade']},m=questionMeasure(j);
 m.supply({supplies:{language:'English'}});assert.equal(m.answer('language','fallback').unnecessary,true);
 assert.deepEqual(m.answer('budget','fallback'),{field:'budget',unnecessary:false,answer:'50'});assert.equal(m.answer('budget','fallback').unnecessary,true);
 m.boundary();assert.equal(m.count(),1);m.supplySelection({supplies:['grade']},{grade_kind:'raw'});m.boundary();assert.equal(m.count(),1,'late supply does not erase a miss');
 const all=questionMeasure(j);all.supply({supplies:{language:'English',budget:'50'}});all.supplySelection({supplies:['grade']},{grade_kind:'raw'});all.boundary();assert.equal(all.count(),0);
 const none=questionMeasure(j);none.boundary();assert.equal(none.count(),3,'oracle answer key is not user supply');
});
test('heldout: missing question observations are not zero or passing thresholds',()=>{
 const r=questionMeasures([{unnecessary_clarifications:2,missed_necessary_questions:1},{completed:false}]);assert.equal(r.M2_missed_necessary_questions.total,1);assert.equal(r.M2_missed_necessary_questions.missing,1);assert.equal(r.M1_unnecessary_clarifications.threshold,null);
 assert.equal(questionMeasures([{}]).M2_missed_necessary_questions.status,'not_measured');assert.throws(()=>score({plan:'heldout'}),/use_scoreHeldout/);assert.throws(()=>scoreHeldout({plan:'reduced'}),/heldout_plan_required/);
});
test('heldout: suppression reaches selection with a counted miss; fixture oracle cannot fill it',async()=>{
 const {shoppingEpisode}=require(R+'orchestrate.cjs'),{collector}=require(R+'qualify-episode-equivalence.cjs');
 const j=structuredClone(training.journeys[1]);j.steps.forEach(s=>{delete s.supplies;});
 const r=await shoppingEpisode(collector('answer'),'L','miss',j);assert.equal(r.completed,true);assert.equal(r.missed_necessary_questions,4);
});
test('heldout: a selection annotation cannot supply a field absent from its accepted requirements',async()=>{
 const set=standinSet(),j=set.journeys[0];
 const user=j.steps.find(step=>step.supplies?.purpose);
 user.user=user.user.replace(user.supplies.purpose,'');
 delete user.supplies.purpose;
 const selection=j.steps.find(step=>step.interface==='select');
 const {episode}=require(R+'baseline-v2.cjs');
 const before=await episode('model-off',j);
 selection.supplies.push('purpose');
 assert.throws(()=>validateStandin(set),/invalid_synthetic_journey_set/);
 assert.equal(before.missed_necessary_questions,1);
 assert.equal((await episode('model-off',j)).missed_necessary_questions,1);
});
test('heldout: trusted controls cannot complete L without a model response',async()=>{
 const {shoppingEpisode}=require(R+'orchestrate.cjs'),{collector}=require(R+'qualify-episode-equivalence.cjs');
 const j=standinSet().journeys[0];
 const noModel=structuredClone(j);
 for(const step of noModel.steps)if(Object.hasOwn(step,'user'))step.model=false;
 const zero=collector('answer');
 const empty=await shoppingEpisode(zero,'L','zero-calls',noModel,{heldout:true});
 assert.equal(zero.requests.length,0);
 assert.equal(empty.completed,false);
 assert.equal(empty.error,'heldout_model_not_observed');

 const refused=collector('answer');
 refused.channel=()=>Object.assign(async()=>({status:503}),{elapsedMs:()=>0});
 const noResponse=await shoppingEpisode(refused,'L','no-response',j,{heldout:true});
 assert.ok(noResponse.counts.model_calls>0);
 assert.equal(noResponse.completed,false);
 assert.equal(noResponse.model_participation,'not_observed');
});
test('heldout: plan has L and model-off only, with separate bounded caps and launch gate',async()=>{
 assert.equal(HELDOUT_BUDGETS.calls,1200);assert.equal(HELDOUT_BUDGETS.input_tokens,6000000);assert.deepEqual(HELDOUT_BUDGETS.usd_per_arm,{L:2,P:0});assert.equal(HELDOUT_BUDGETS.usd,2);
 const {main,REVIEW_GO}=require(R+'live-host.cjs'),{hash}=require('../../../src/lib/pokemon/shopping/schema.cjs'),raw=fs.mkdtempSync(os.tmpdir()+'/heldout-go-'),saved=process.env.POT_SHOPPING_REVIEW_GO;
 try{const sha=hash(fs.readFileSync(ROOT+'/reports/pot-shopping-phase3-20261101/freeze.json','utf8'));
  for(const go of ['claude_3c_smoke_go','claude_3c_reduced_go','claude_3c_compat_go',undefined]){if(go)process.env.POT_SHOPPING_REVIEW_GO=go;else delete process.env.POT_SHOPPING_REVIEW_GO;await assert.rejects(main('L',raw,sha,'heldout'),/claude_exact_freeze_review_required/);}
  process.env.POT_SHOPPING_REVIEW_GO=REVIEW_GO.heldout;assert.equal(REVIEW_GO.heldout,'claude_4_heldout_go');await assert.rejects(main('P',raw,sha,'heldout'),/heldout_is_L_only/);await assert.rejects(main('L',raw,sha,'heldout'),/bound_heldout_required/);
 }finally{if(saved===undefined)delete process.env.POT_SHOPPING_REVIEW_GO;else process.env.POT_SHOPPING_REVIEW_GO=saved;fs.rmSync(raw,{recursive:true,force:true});}
});
test('heldout: collector enforces each budget before transport and rejects P directly',async()=>{
 const {setup,requestFixture}=require('./collector.test.cjs');
 for(const kind of ['calls','input_tokens','usd','P']){
  const x=setup();x.args.plan='heldout';x.args.freeze.heldout_budgets=HELDOUT_BUDGETS;x.args.freeze.heldout_fixture={journeys_sha256:'a'.repeat(64)};
  const c=x.open();await c.request('L','first',requestFixture());c.close();
  const s=JSON.parse(fs.readFileSync(x.checkpoint));if(kind!=='P')s.arms.L[kind]=HELDOUT_BUDGETS[kind];fs.writeFileSync(x.checkpoint,JSON.stringify(s));
  const d=x.open(),before=x.seen.length;await assert.rejects(d.request(kind==='P'?'P':'L','blocked',requestFixture()),kind==='P'?/heldout_is_L_only/:/budget_exhausted/);assert.equal(x.seen.length,before);d.close();
 }
 const x=setup();x.args.plan='heldout';x.args.freeze.heldout_budgets={...HELDOUT_BUDGETS,usd:3};assert.throws(x.open,/frozen_heldout_limits_mismatch/);
});
