'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os');
const R='../../../reports/pot-shopping-phase3-20261101/';
const {training,questionMeasure,ROOT}=require(R+'journey-data.cjs'),{validate}=require(R+'validate-heldout.cjs');
const {questionMeasures,scoreHeldout,score}=require('../../../src/lib/pokemon/shopping/model/scoring.cjs');
const {HELDOUT_BUDGETS}=require('../../../src/lib/pokemon/shopping/model/collector.cjs');
const catalog=require('../../fixtures/shopping/catalog.json');
function valid(set=structuredClone(training),cat=structuredClone(catalog)){return validate(set,{[training.journeys[0].catalog]:cat});}
test('heldout: v2 references, steps, supply spans and synthetic boundaries are checked',()=>{
 assert.equal(valid().journeys,4);
 const edits=[s=>s.schema='v1',s=>s.journeys[0].required_fields=['missing'],s=>s.journeys[0].steps=[],s=>s.journeys[0].steps[0].supplies.language='not in text',s=>s.journeys[0].steps.push({interface:'approve_purchase'}),s=>s.journeys[0].offer_ref='unknown',s=>s.journeys[0].steps.find(s=>s.interface==='compare_offers').offer_refs=['unknown']];
 for(const edit of edits){const s=structuredClone(training);edit(s);assert.throws(()=>valid(s));}
 for(const edit of [c=>c.synthetic=false,c=>c.offers[0].url='https://evil.example/x',c=>c.offers[0].source_ref='missing',c=>c.offers[0].evidence_ref=c.sellers[0].evidence_ref,c=>c.offers[0].certificate_ref='missing',c=>c.certificate.printing_ref='missing',c=>c.destinations[0].synthetic=false,c=>c.offers[0].synthetic=false]){const c=structuredClone(catalog);edit(c);assert.throws(()=>valid(undefined,c));}
});
test('heldout: M1 uses answer key once and M2 latches missed fields before selection or preview',()=>{
 const j={answer_key:{language:'English',budget:'50',grade:'raw'},required_fields:['language','budget','grade']},m=questionMeasure(j);
 m.supply({supplies:{language:'English'}});assert.equal(m.answer('language','fallback').unnecessary,true);
 assert.deepEqual(m.answer('budget','fallback'),{field:'budget',unnecessary:false,answer:'50'});assert.equal(m.answer('budget','fallback').unnecessary,true);
 m.boundary();assert.equal(m.count(),1);m.supply({supplies:['grade']});m.boundary();assert.equal(m.count(),1,'late supply does not erase a miss');
 const all=questionMeasure(j);all.supply({supplies:{language:'English',budget:'50'}});all.supply({supplies:['grade']});all.boundary();assert.equal(all.count(),0);
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
