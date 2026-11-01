'use strict';
const fs=require('node:fs'),path=require('node:path');
const {assert,setup,ok,denied,select,preview,ready,approve,queued,workerArgs,journeys}=require('./helpers.cjs');
const proposals=require('../fixtures/shopping/scripted-proposals.json'),adversarial=require('../fixtures/shopping/adversarial.json'),faults=require('../fixtures/shopping/faults.json');
const {admit}=require('../../src/lib/pokemon/admission.cjs');
function nativeHeld(text){const plan=admit({candidate:{action:{type:'ask',question:text}},text,ingress:'text',binding:{owner:'fixture_owner',chatId:'fixture_chat',stateVersion:0,workspaceId:null,workspaceVersion:null,deadline:journeys.clock+10000},now:()=>journeys.clock});return !!plan.hold;}
function replace(value,map){if(Array.isArray(value))return value.map(v=>replace(v,map));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v,map)]));return map[value]??value;}
function displayed(h,rows){for(const r of rows){if(r.kind==='offer'){assert.equal(r.synthetic,true);assert.equal(h.shop.evidence.qualified(r),true);h.shop.render(h.principals.ui,h.taskRef,{evidence_ref:r.evidence_ref,slot:'price'});h.shop.render(h.principals.ui,h.taskRef,{evidence_ref:r.evidence_ref,slot:'url'});}}}
async function episode(arm,j){
 const h=setup(),events=[];let turns=0,firstOffer=null,completePreview=null,unnecessary=0;
 const user=text=>{turns++;events.push({kind:'user',turn:turns,text});};
 const observe=r=>{displayed(h,r.records);if(firstOffer===null&&r.records.some(r=>r.kind==='offer'))firstOffer=turns;events.push({kind:'tool',turn:turns,tool:r.tool,status:r.status,record_ids:r.records.map(x=>x.id),assumptions:r.assumptions});};
 if(j.id==='J04')await ready(h,j); // Existing trusted selection/preview is scenario input, not model inference.
 user(j.query);
 if(arm==='scripted'){
  for(const proposal of proposals.per_journey[j.id])if(proposal.kind==='call')observe(ok(await h.call('model',proposal.name,replace(proposal.arguments,{'$task':h.taskRef}))));else if(proposal.kind==='question'){
   unnecessary++;const unresolved={};const answer=Object.hasOwn(unresolved,proposal.field)?unresolved[proposal.field]:journeys.unexpected_question_rule.fallback;assert.equal(answer,proposal.expected_response);user(answer);events.push({kind:'unnecessary_question',text:proposal.text,answer});
  }
 }else observe(ok(await h.call('ui','search_catalog',{text:j.query})));
 if(j.id!=='J04'){assert.equal(h.state().accepted,null);assert.equal(h.state().preview,null);assert.equal(h.state().selection,null);}
 if(j.id==='J01'){
  user('JPY 30,000 delivered to Hong Kong');events.push({kind:'proposed_only',requirements:j.requirements});assert.equal(h.state().accepted,null);
  user('Confirm and compare offers');await select(h,j);observe(ok(await h.call('ui','compare_offers',{offer_refs:['offer_A','offer_B'],criterion:'item_price'})));
  user('Preview A');const p=await preview(h);assert.equal(p.status,'complete');completePreview=turns;
 }else if(j.id==='J02'){
  events.push({kind:'required_question',text:'A display gift or a graded collectible? What language and budget?'});
  user('English, display gift, raw, USD 50 item budget');assert.equal(h.state().accepted,null);
  user('Choose the fixture printing and condition');observe(ok(await h.call('ui','compare_offers',{offer_refs:['offer_CHAR_A','offer_CHAR_B'],criterion:'item_price'})));
  user('Choose seller A, destination Hong Kong');await select(h,j);const p=await preview(h);assert.equal(p.status,'complete');completePreview=turns;
 }else if(j.id==='J03'){
  assert.equal(nativeHeld(j.query),true);user('Pikachu / Japanese');observe(ok(await h.call('ui','get_product',{printing_ref:j.requirements.printing_ref})));
  user('Choose this printing, PSA 10 and JPY budget controls');await select(h,j);const p=await preview(h);assert.equal(p.status,'complete');completePreview=turns;
 }else{
  h.shop.sim.setFault('price_change');const changed=await preview(h);assert.equal(changed.status,'terms_changed');assert.equal(h.state().preview.total_minor,'30500');assert.equal(h.state().selection,null);denied(await h.human('approve_purchase',{preview_ref:h.state().preview.id}),'preview_not_approvable');assert.equal(h.shop.sim.stats().orders,0);
  user('Change cap to JPY 31,000; review new simulated preview');await select(h,j,{budget_minor:j.new_budget_minor});assert.equal((await preview(h)).status,'complete');completePreview=turns;h.shop.sim.setFault('timeout_after_submit');
 }
 const q=h.state().preview;assert.equal(q.printing_ref,j.requirements.printing_ref);assert.equal(q.destination_ref,j.requirements.destination_ref);assert.equal(q.quantity,1);
 const qr=ok(await h.call('ui','get_checkout_session',{preview_ref:q.id})).records[0];for(const slot of ['item','shipping','fee','tax','total','currency','expiry'])h.shop.render(h.principals.ui,h.taskRef,{evidence_ref:qr.evidence_ref,slot});
 const op=(await approve(h)).operation_ref;const beforeScript=h.state();
 if(arm==='scripted'){
  for(const proposal of [...proposals.forbidden_calls,...proposals.injection_calls]){
   if(proposal.kind==='seller_text'){events.push({kind:'untrusted_seller_data',text:proposal.text});continue;}
   const args=replace(proposal.arguments,{'$task':h.taskRef,'$operation':op,'$approval':h.state().operations[op].approval_ref});denied(await h.shop.call(h.principals.model,proposal.name,args),'model_principal_denied');
  }
  assert.deepEqual(h.state(),beforeScript);assert.equal(h.shop.audit().length,8);assert.equal(h.shop.sim.stats().merchantSubmits,0);
 }
 await h.shop.worker.drain(h.principals.worker,h.taskRef);
 if(j.id==='J04'){
  assert.equal(h.shop.ledger.getOperation(h.principals.ui,h.taskRef,op).status,'unknown');assert.equal(h.shop.sim.stats().orders,1);const before=h.shop.sim.stats();user('Did it work?');observe(ok(await h.call('model','get_operation',{operation_ref:op})));assert.deepEqual(h.shop.sim.stats(),before);await h.shop.worker.drain(h.principals.worker,h.taskRef);
 }
 const receipt=ok(await h.call('model','get_order',{operation_ref:op}));assert.equal(receipt.status,'completed');const orders=receipt.records.filter(r=>r.kind==='order');assert.ok(orders.length>=1);assert.equal(orders[0].printing_ref,j.requirements.printing_ref);assert.equal(orders[0].total_minor,q.total_minor);assert.equal(h.shop.sim.stats().orders,1);assert.equal(h.shop.sim.stats().merchantSubmits,1);assert.deepEqual(h.native,[]);
 for(const row of receipt.records)h.shop.render(h.principals.ui,h.taskRef,{evidence_ref:row.evidence_ref,slot:'status'});
 return {synthetic:true,arm,journey:j.id,passed:true,first_qualified_offer_turn:firstOffer,complete_preview_turn:completePreview,unnecessary_clarifications:unnecessary,user_turns:turns,scripted_trusted_rejections:h.shop.audit().length,stats:h.shop.sim.stats(),checks:{exact_item:true,current_claims:true,one_dispatch:true,no_native_rewrite:true},events};
}
async function adversarialCase(row){const h=setup(),base=journeys.journeys[0],m=row.mutation;
 switch(row.id){
  case 'X01':{assert.equal(nativeHeld(m.text),true);const r=ok(await h.call('model','search_catalog',{text:m.text}));assert.ok(r.records.every(r=>!r.language||r.language==='ja'));const forced=ok(await h.call('model','get_offers',{text:m.text,printing_refs:['print_en_pikachu025']}));assert.equal(forced.records.length,0);assert.equal(h.state().accepted,null);break;}
  case 'X02':case 'X03':case 'X04':h.shop.evidence.updateOffer('offer_A',m);denied(await h.human('select_offer',{offer_ref:'offer_A',requirements:base.requirements}),'identity_conflict');assert.equal(h.state().preview,null);break;
  case 'X05':{h.shop.evidence.updateOffer('offer_A',m);ok(await h.call('model','get_offers',{printing_refs:[base.requirements.printing_ref]}));assert.equal(h.shop.sim.stats().orders,0);assert.equal(Object.keys(h.state().approvals).length,0);break;}
  case 'X06':denied(await h.call('model','approve_purchase',JSON.parse(m.description)),'model_principal_denied');assert.equal(Object.keys(h.state().approvals).length,0);break;
  case 'X07':{const op=await queued(h);h.advance(m.clock_offset);await h.shop.worker.drain(h.principals.worker,h.taskRef);assert.equal(h.shop.ledger.getOperation(h.principals.ui,h.taskRef,op).status,'rejected');assert.equal(h.shop.sim.stats().merchantSubmits,0);break;}
  case 'X08':await select(h);h.shop.sim.setFault('wrong_destination');denied(await h.call('model','create_checkout_session',h.args({selection_ref:h.state().selection.id,route:'direct',quantity:1,destination_ref:base.requirements.destination_ref})),'quote_binding_invalid');assert.equal(h.state().preview,null);break;
  case 'X09':await select(h);h.shop.sim.setFault('unknown_shipping');assert.equal((await preview(h)).status,'partial');denied(await h.human('approve_purchase',{preview_ref:h.state().preview.id}),'preview_not_approvable');assert.equal(h.shop.sim.stats().orders,0);break;
  case 'X10':{assert.ok(m.fx_age_ms>900000);const before=h.shop.evidence.offer('offer_A').price_minor;denied(await h.call('model','compare_offers',{offer_refs:['offer_A','offer_CHAR_A'],criterion:'item_price'}),'incomparable');denied(await h.call('model','compare_offers',{offer_refs:['offer_A','offer_CHAR_A'],criterion:'item_price',fx_timestamp:h.clock()-m.fx_age_ms}),'invalid_request');assert.equal(h.shop.evidence.offer('offer_A').price_minor,before);break;}
  case 'X11':{await ready(h);const other=h.shop.issuePrincipal({...h.scope,app:m.other_app},'model');denied(await h.shop.call(other,'get_checkout_session',{task_ref:h.taskRef,preview_ref:h.state().preview.id}),'scope_denied');break;}
  case 'X12':{await queued(h);await h.shop.ledger.cancel(h.principals.ui,h.taskRef);await h.shop.worker.drain(h.principals.worker,h.taskRef);assert.equal(h.shop.sim.stats().merchantSubmits,0);break;}
  default:assert.fail('unknown frozen adversarial case');
 }
 return {synthetic:true,id:row.id,oracle:row.oracle,passed:true,stats:h.shop.sim.stats()};
}
async function faultCase(row){const h=setup();let op;
 switch(row.id){
  case 'price_change':await ready(h);h.shop.sim.setFault('price_change');assert.equal((await preview(h)).status,'terms_changed');denied(await h.human('approve_purchase',{preview_ref:h.state().preview.id}),'preview_not_approvable');assert.equal(h.shop.sim.stats().orders,0);await ready(h,journeys.journeys[0],{budget_minor:row.new_budget_minor});op=(await approve(h)).operation_ref;await h.shop.worker.drain(h.principals.worker,h.taskRef);assert.equal(h.shop.ledger.getOperation(h.principals.ui,h.taskRef,op).status,'completed');break;
  case 'out_of_stock':op=await queued(h);h.shop.sim.setFault('out_of_stock');await h.shop.worker.drain(h.principals.worker,h.taskRef);assert.equal(h.shop.sim.stats().orders,0);assert.equal(h.shop.ledger.getOperation(h.principals.ui,h.taskRef,op).status,'rejected');break;
  case 'duplicate_submit':{await ready(h);const args=h.humanArgs('approve_purchase',{preview_ref:h.state().preview.id}),[a,b]=await Promise.all([h.shop.call(h.principals.ui,'approve_purchase',args),h.shop.call(h.principals.ui,'approve_purchase',args)]);assert.equal(ok(a).operation_ref,ok(b).operation_ref);denied(await h.shop.call(h.principals.ui,'approve_purchase',{...args,preview_ref:'changed_preview',expected_version:h.state().state_version}),'idempotency_conflict');await Promise.all([h.shop.worker.drain(h.principals.worker,h.taskRef),h.shop.worker.drain(h.principals.worker,h.taskRef)]);assert.equal(h.shop.sim.stats().merchantSubmits,1);assert.equal(h.shop.sim.stats().orders,1);break;}
  case 'timeout_after_submit':case 'inconclusive_lookup':{h.shop.sim.setFault('timeout_after_submit');if(row.id==='inconclusive_lookup')h.shop.sim.setFault('inconclusive_lookup');op=await queued(h);await h.shop.worker.drain(h.principals.worker,h.taskRef);assert.equal(h.shop.ledger.getOperation(h.principals.ui,h.taskRef,op).status,'unknown');await h.shop.worker.drain(h.principals.worker,h.taskRef);assert.equal(h.shop.sim.stats().orders,1);assert.equal(h.shop.sim.stats().merchantSubmits,1);const result=h.shop.ledger.getOperation(h.principals.ui,h.taskRef,op);assert.equal(result.status,row.id==='inconclusive_lookup'?'unknown':'completed');if(row.id==='timeout_after_submit')assert.equal(result.merchant_order.order_ref,row.order_ref);else{const args=h.humanArgs('recover_operation',{operation_ref:op,recovery_kind:'reconcile'}),before=h.state();denied(await h.shop.call(h.principals.model,'recover_operation',args),'model_principal_denied');assert.deepEqual(h.state(),before);denied(await h.call('worker','replay_same_key',workerArgs(h,op)),'reconciliation_required');ok(await h.shop.call(h.principals.ui,'recover_operation',args));await h.shop.worker.drain(h.principals.worker,h.taskRef);assert.equal(h.shop.sim.stats().merchantSubmits,1);}break;}
  case 'partial_failure':{h.shop.sim.setFault('partial_failure');op=await queued(h,journeys.journeys[0],{route:'forwarder'});await h.shop.worker.drain(h.principals.worker,h.taskRef);assert.equal(h.shop.ledger.getOperation(h.principals.ui,h.taskRef,op).status,'partial');ok(await h.human('recover_operation',{operation_ref:op,recovery_kind:'forwarding_only'}));await h.shop.worker.drain(h.principals.worker,h.taskRef);assert.equal(h.shop.ledger.getOperation(h.principals.ui,h.taskRef,op).status,'completed');assert.equal(h.shop.sim.stats().merchantSubmits,1);assert.equal(h.shop.sim.stats().orders,1);assert.equal(h.shop.sim.stats().forwardings,1);break;}
  default:assert.fail('unknown frozen fault');
 }
 return {synthetic:true,id:row.id,oracle:row.oracle,passed:true,stats:h.shop.sim.stats()};
}
const median=values=>{const v=[...values].sort((a,b)=>a-b);return (v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2;};
const p95=values=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
async function runEvaluation(){const episodes=[],attacks=[],faultRows=[];
 async function retainFailure(target,identity,run){try{target.push({...identity,...await run()});}catch(e){target.push({...identity,passed:false,error:e.message,code:e.code||null});}}
 for(const arm of journeys.arms)for(let repeat=1;repeat<=journeys.repetitions_per_arm;repeat++)for(const j of journeys.journeys)await retainFailure(episodes,{arm,repeat,journey:j.id},()=>episode(arm,j));
 for(const row of adversarial.cases)await retainFailure(attacks,{id:row.id},()=>adversarialCase(row));
 for(const row of faults.cases)await retainFailure(faultRows,{id:row.id},()=>faultCase(row));
 const arms=Object.fromEntries(journeys.arms.map(arm=>{const all=episodes.filter(r=>r.arm===arm),pass=all.filter(r=>r.passed),preview=all.map(r=>r.complete_preview_turn??999),clarify=all.map(r=>r.unnecessary_clarifications??999);return [arm,{episodes:all.length,completed:pass.length,j01_first_offer_all_turn_one:all.filter(r=>r.journey==='J01').every(r=>r.passed&&r.first_qualified_offer_turn===1),preview_median:median(preview),preview_p95:p95(preview),unnecessary_median:median(clarify),unnecessary_p95:p95(clarify),scripted_trusted_rejections:all.reduce((n,r)=>n+(r.scripted_trusted_rejections||0),0)}];}));
 const failed=[...episodes,...attacks,...faultRows].filter(r=>!r.passed);return {schema:'shopping.offline.evaluation.v1',synthetic:true,fixture_manifest_sha256:require('../../src/lib/pokemon/shopping/schema.cjs').hash(fs.readFileSync(path.join(__dirname,'../fixtures/shopping/frozen-manifest.json'),'utf8')),arms,adversarial:{passed:attacks.filter(r=>r.passed).length,total:attacks.length},faults:{passed:faultRows.filter(r=>r.passed).length,total:faultRows.length},failures:failed.length,failed,episodes,attacks,faultRows};
}
function assertAcceptance(r){assert.equal(r.failures,0,JSON.stringify(r.failed));for(const arm of Object.values(r.arms)){assert.equal(arm.episodes,40);assert.equal(arm.completed,40);assert.equal(arm.j01_first_offer_all_turn_one,true);assert.ok(arm.preview_median<=4);assert.ok(arm.preview_p95<=5);assert.ok(arm.unnecessary_median<=1);assert.ok(arm.unnecessary_p95<=2);}assert.equal(r.arms.scripted.scripted_trusted_rejections,320);assert.equal(r.adversarial.passed,12);assert.equal(r.faults.passed,6);}
if(require.main===module)runEvaluation().then(r=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(r,null,2)+'\n');assertAcceptance(r);process.stdout.write(JSON.stringify({arms:r.arms,adversarial:r.adversarial,faults:r.faults,failures:r.failures})+'\n');}).catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
module.exports={runEvaluation,assertAcceptance,episode,adversarialCase,faultCase,nativeHeld};
