'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os');
const path=require('node:path'),{createHash}=require('node:crypto');
const R='../../../reports/pot-shopping-phase3-20261101/';
const {training,questionMeasure,ROOT}=require(R+'journey-data.cjs'),{validate,load,loadQualified}=require(R+'validate-heldout.cjs');
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
function scriptedCollector(respond) {
 const fake=require(R+'qualify-episode-equivalence.cjs').collector('answer');
 fake.channel=()=>Object.assign(async request=>{
  fake.requests.push(structuredClone(request));
  return respond(fake.requests.length);
 },{elapsedMs:()=>0});
 return fake;
}
const answerPlan={decision:'answer',fields:[],claims:[]};
function reply(plan) {
 return {status:200,body:{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(plan)}]}}]}};
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
  j=>j.steps.unshift({interface:'fault',name:'timeout_after_submit'}),
  j=>{j.steps.find(s=>s.interface==='select').changes={budget_minor:'00'};}
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
 for(const url of ['HTTPS://example.invalid/item','https://example.invalid']){
  const cat=structuredClone(catalog);
  cat.offers[0].url=url;
  assert.throws(()=>validateStandin(standinSet(),cat),/invalid_synthetic_journey_set/);
 }
 const set=standinSet();
 set.journeys[0].transcript+=' HTTPS://external.example/item';
 assert.throws(()=>validateStandin(set),/invalid_synthetic_journey_set/);
});
test('heldout: qualification rejects a valid-shaped script that the simulator cannot complete',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'heldout-preflight-'));
 try{
  const set=standinSet(),j=set.journeys[0],file=path.join(dir,'journeys.json');
  j.catalog='catalog.json';
  fs.writeFileSync(path.join(dir,j.catalog),JSON.stringify(catalog));
  fs.writeFileSync(file,JSON.stringify(set));
  assert.equal((await loadQualified(file)).counts.journeys,1);

  j.steps.find(s=>s.interface==='select').changes={budget_minor:'0'};
  fs.writeFileSync(file,JSON.stringify(set));
  assert.equal(load(file).counts.journeys,1);
  await assert.rejects(loadQualified(file),/^Error: heldout_script_preflight_failed$/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
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
test('heldout: one clarification turn answers every distinct field and counts unnecessary fields',async()=>{
 const {shoppingEpisode}=require(R+'orchestrate.cjs');
 const j=standinSet().journeys[0];
 const later=j.steps.find(step=>step.supplies?.purpose);
 later.user=later.user.replace(later.supplies.purpose,'');
 delete later.supplies.purpose;
 const fake=scriptedCollector(call=>reply(call===1 ?
  {decision:'clarify',fields:['language','purpose','condition','language'],claims:[]} : answerPlan));

 const result=await shoppingEpisode(fake,'L','journey/J02/1',j,{heldout:true});
 const fallback=training.unexpected_question_rule.fallback;
 const userText=request=>JSON.parse(request.contents[0].parts[0].text).text;
 assert.equal(result.completed,true);
 assert.equal(result.unnecessary_clarifications,1);
 assert.equal(result.missed_necessary_questions,0);
 assert.deepEqual(result.questions.map(q=>q.field),['language','purpose','condition']);
 assert.equal(result.user_turns,j.steps.filter(step=>Object.hasOwn(step,'user')).length+1);
 assert.deepEqual(fake.requests.map(userText),[j.query,[j.answer_key.language,j.answer_key.purpose,fallback].join('\n'),later.user]);
});
test('heldout: durable scoring separates HTTP receipts, usable plans and fallback-only checkout',async()=>{
 const {shoppingEpisode,runHeldoutBaseline}=require(R+'orchestrate.cjs');
 const {hash}=require('../../../src/lib/pokemon/shopping/schema.cjs');
 const set=standinSet(),j=set.journeys[0];
 const binding={journeys_value_sha256:hash(set)};
 const heldout={set,binding,catalogs:{[j.catalog]:catalog}};
 const baseline=await runHeldoutBaseline(heldout);
 const state={
  plan:'heldout',rehearsal:true,heldout_fixture:binding,records:[],
  outcomes:[{arm:'L',id:'model_off_baseline',result:{rows:baseline}}]
 };
 const blocked={status:200,body:{promptFeedback:{blockReason:'SAFETY'}}};
 for(const repeat of [1,2]){
  const id='journey/J02/'+repeat;
  const fake=scriptedCollector(call=>repeat===2&&call===1?reply(answerPlan):blocked);
  const result=await shoppingEpisode(fake,'L',id,j,{heldout:true});
  assert.equal(result.script_completed,true);
  assert.equal(result.completed,repeat===2);
  assert.equal(result.model_participation,repeat===1?'fallback_only':'usable');
  state.outcomes.push(...fake.outcomes,{arm:'L',id,result});
  state.records.push(...fake.requests.map((_,i)=>({arm:'L',id:id+'/call-'+(i+1),status:'completed',http_status:200})));
 }

 const scored=scoreHeldout(state,baseline,heldout);
 assert.equal(scored.expected,10);
 assert.equal(scored.completed,1);
 assert.deepEqual(scored.model_participation,{observed:2,usable:1,fallback_only_completed:1,not_observed:0,unrecorded:8});
 assert.deepEqual(scored.fallbacks,{turns:4,count:3,share:0.75,reasons:{safety_block:3}});
 assert.equal(scored.L.M2_missed_necessary_questions.measured,1);
 assert.equal(scored.L.M2_missed_necessary_questions.missing,9);
 const withoutUsableTurn={...state,outcomes:state.outcomes.filter(row=>row.id!=='model_turn/journey/J02/2/1')};
 assert.equal(scoreHeldout(withoutUsableTurn,baseline,heldout).completed,0);
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
