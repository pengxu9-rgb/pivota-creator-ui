'use strict';
const {setup,ok,denied,select,preview,approve,assert}=require('../../tests/shopping/helpers.cjs');
const {nativeHeld}=require('../../tests/shopping/evaluate.cjs');
const data=require('./journey-data.cjs');
async function episode(arm,input,{catalog}={}){
 assert.equal(arm,'model-off');const j=data.v2(input),h=setup({catalog:catalog||data.fixture(j)}),events=[],m=data.questionMeasure(j);
 let turns=0,firstOffer=null,completePreview=null,op;
 const user=text=>{turns++;events.push({kind:'user',turn:turns,text});};
 function observe(r){for(const row of r.records)if(row.kind==='offer'){assert.equal(row.synthetic,true);assert.equal(h.shop.evidence.qualified(row),true);for(const slot of ['price','url'])h.shop.render(h.principals.ui,h.taskRef,{evidence_ref:row.evidence_ref,slot});}if(firstOffer===null&&r.records.some(r=>r.kind==='offer'))firstOffer=turns;events.push({kind:'tool',turn:turns,tool:r.tool,status:r.status,record_ids:r.records.map(x=>x.id),assumptions:r.assumptions});}
 async function step(s){
  if(s.user!==undefined){if(s.native_hold)assert.equal(nativeHeld(j.query),true);if(s.baseline_question)events.push({kind:'required_question',text:s.baseline_question});m.supply(s);user(s.user);if(s.proposed_only){events.push({kind:'proposed_only',requirements:j.requirements});assert.equal(h.state().accepted,null);}return;}
  switch(s.interface){
   case 'select':
    await select(h,j,s.changes||{});
    m.supplySelection(s,h.state().accepted);
    m.boundary();
    break;
   case 'preview':{m.boundary();const p=await preview(h);assert.equal(p.status,s.expect);if(s.measure==='complete_preview')completePreview=turns;break;}
   case 'search_catalog':observe(ok(await h.call('ui','search_catalog',{text:s.text})));break;
   case 'compare_offers':observe(ok(await h.call('ui','compare_offers',{offer_refs:s.offer_refs,criterion:s.criterion})));break;
   case 'get_product':observe(ok(await h.call('ui','get_product',{printing_ref:s.printing_ref})));break;
   case 'observe_offer':break;
   case 'fault':h.shop.sim.setFault(s.name);break;
   case 'deny_approval':denied(await h.human('approve_purchase',{preview_ref:h.state().preview.id}),'preview_not_approvable');break;
   case 'get_operation':
    if(!op)throw Error('approval_required_before_operation');
    observe(ok(await h.call('model','get_operation',{operation_ref:op})));
    break;
   case 'drain':await h.shop.worker.drain(h.principals.worker,h.taskRef);break;
   default:throw Error('unknown_interface_step');
  }
 }
 await data.steps(j.steps,step);
 const q=h.state().preview;
 if(q?.status!=='complete')throw Error('approvable_preview_required');
 assert.equal(q.printing_ref,j.requirements.printing_ref);assert.equal(q.destination_ref,j.requirements.destination_ref);assert.equal(q.quantity,1);
 const qr=ok(await h.call('ui','get_checkout_session',{preview_ref:q.id})).records[0];for(const slot of ['item','shipping','fee','tax','total','currency','expiry'])h.shop.render(h.principals.ui,h.taskRef,{evidence_ref:qr.evidence_ref,slot});
 op=(await approve(h)).operation_ref;await h.shop.worker.drain(h.principals.worker,h.taskRef);await data.steps(j.after_approval||[],step);
 const receipt=ok(await h.call('model','get_order',{operation_ref:op}));
 assert.equal(receipt.status,'completed');
 const order=receipt.records.find(row=>row.kind==='order');
 assert.ok(order);
 assert.equal(order.printing_ref,j.requirements.printing_ref);
 assert.equal(order.total_minor,q.total_minor);
 assert.equal(h.shop.sim.stats().orders,1);assert.equal(h.shop.sim.stats().merchantSubmits,1);assert.deepEqual(h.native,[]);
 for(const row of receipt.records)h.shop.render(h.principals.ui,h.taskRef,{evidence_ref:row.evidence_ref,slot:'status'});
 return {synthetic:true,arm,journey:j.id,passed:true,first_qualified_offer_turn:firstOffer,complete_preview_turn:completePreview,unnecessary_clarifications:0,user_turns:turns,scripted_trusted_rejections:h.shop.audit().length,stats:h.shop.sim.stats(),checks:{exact_item:true,current_claims:true,one_dispatch:true,no_native_rewrite:true},events,missed_necessary_questions:m.count()};
}
module.exports={episode};
