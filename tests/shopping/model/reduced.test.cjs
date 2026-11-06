'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup,response,requestFixture}=require('./collector.test.cjs');
const {fixture,freeze,baseline}=require('./scoring.test.cjs');
const {score}=require('../../../src/lib/pokemon/shopping/model/scoring.cjs');
const {BUDGETS,STOP_RULES}=require('../../../src/lib/pokemon/shopping/model/collector.cjs');
const mapping=require('../../fixtures/shopping-model-eval/compatibility-mapping.json');
const reducedFreeze=()=>({...freeze,corpus_plan:{compatibility:{enabled:false}}});
function reducedState(){const s=fixture();s.outcomes=s.outcomes.filter(o=>!o.id.startsWith('compatibility/'));return s;}
test('model eval reduced: budgets are1500/750,15M,$25 and asymmetric5/20',()=>{
 assert.equal(BUDGETS.calls,1500);assert.equal(BUDGETS.calls_per_arm,750);assert.equal(BUDGETS.input_tokens,15000000);assert.equal(BUDGETS.usd,25);assert.deepEqual(BUDGETS.usd_per_arm,{L:5,P:20});
});
test('model eval reduced: three consecutive rejected responses stop arm',async()=>{
 const x=setup([response(),response(400),response(422),response(400),response()]),c=x.open();
 for(let i=0;i<4;i++)await c.request('L','rejected_'+i,requestFixture());
 const s=c.state();assert.equal(s.arms.L.stop_reason,'request_rejected');assert.equal(s.arms.L.stop_trigger.request_rejection_streak,3);assert.equal(s.stop_reason,null);
 await assert.rejects(c.request('L','after_stop',requestFixture()),/collector_stopped/);assert.equal(c.state().records.length,4);c.close();
});
test('model eval reduced: success and429 reset rejection streak;401/403 retain immediate global stop',async()=>{
 const x=setup([response(),response(400),response(),response(422),response(429),response(),response(400),response(400),response(400)]),c=x.open();
 for(let i=0;i<8;i++)await c.request('L','reset_'+i,requestFixture());
 assert.equal(c.state().arms.L.stop_reason,'request_rejected');assert.equal(c.state().arms.L.stop_trigger.request_rejection_streak,3);c.close();
 for(const status of [401,403]){const y=setup([response(),response(status)]),d=y.open();await d.request('L','preflight',requestFixture());await d.request('L','auth',requestFixture());assert.equal(d.state().stop_reason,'access_denied');d.close();}
});
test('model eval reduced: rejection stop rule is frozen and mismatch refuses before transport',()=>{
 const x=setup();x.args.freeze.stop_rules={...STOP_RULES,request_rejected:{consecutive_non_429_4xx:4,scope:'arm'}};assert.throws(x.open,/frozen_stop_rules_mismatch/);assert.equal(x.seen.length,0);
});
test('model eval reduced: no-response timeout does not erase consecutive HTTP rejections',async()=>{
 const x=setup([response(),response(400),response(null,{body:null,error:'timeout'}),response(422),response(null,{body:null,error:'timeout'}),response(400)]),c=x.open();
 for(let i=0;i<6;i++)await c.request('L','no_response_'+i,requestFixture());
 assert.equal(c.state().arms.L.stop_reason,'request_rejected');assert.equal(c.state().arms.L.stop_trigger.request_rejection_streak,3);c.close();
});
test('model eval reduced: compatibility and cross-pass flips are not measured, never passed',()=>{
 const r=score(reducedState(),baseline,mapping,reducedFreeze());for(const arm of Object.values(r.arms)){assert.equal(arm.thresholds.compatibility,null);assert.equal(arm.thresholds.zero_catalog_hold_flips,null);assert.equal(arm.metrics.catalog_hold_flips,null);assert.equal(arm.threshold_evidence.compatibility.status,'not_measured');assert.equal(arm.all_thresholds_measured,false);assert.equal(arm.eligible_for_full_qualification,false);assert.equal(arm.improves,false);}
 assert.match(r.conclusion,/compatibility not measured/);
 const s=reducedState();s.outcomes.push(fixture().outcomes.find(o=>o.id.startsWith('compatibility/')));assert.throws(()=>score(s,baseline,mapping,reducedFreeze()),/compatibility_not_in_reduced_plan/);
});
test('model eval reduced: fallbacks and reasons accompany every threshold without double counting',()=>{
 const s=reducedState();s.outcomes[0].result.model_turns=[{fallback:true,reason:'timeout'},{fallback:false}];
 s.outcomes.push({arm:'L',id:'model_turn/journey/J01/1/1',result:{fallback:true,reason:'timeout'}},{arm:'L',id:'model_turn/journey/J01/1/2',result:{fallback:false}},{arm:'L',id:'model_turn/fault/partial_failure/1',result:{fallback:true,reason:'invalid_output'}});
 const a=score(s,baseline,mapping,reducedFreeze()).arms.L;
 assert.deepEqual(a.fallbacks.reasons,{timeout:1,invalid_output:1});assert.equal(a.fallbacks.turns,3);assert.equal(a.fallbacks.count,2);assert.equal(a.fallbacks.share,2/3);
 for(const evidence of Object.values(a.threshold_evidence)){assert.equal(evidence.fallbacks.count,2);if(evidence.status==='passed'){assert.equal(evidence.met_with_fallback,true);assert.equal(evidence.met_only_with_fallback_evidence,true);assert.equal(evidence.fallback_free_pass,false);}}
 s.outcomes[0].result.completed=false;assert.equal(score(s,baseline,mapping,reducedFreeze()).arms.L.fallbacks.count,2);
});
test('model eval reduced: a smoke checkpoint is never scored',()=>{
 const s=reducedState();s.plan='smoke';assert.throws(()=>score(s,baseline,mapping,reducedFreeze()),/smoke_not_scored/);
 const r=reducedState();r.plan='reduced';assert.doesNotThrow(()=>score(r,baseline,mapping,reducedFreeze()));
});
