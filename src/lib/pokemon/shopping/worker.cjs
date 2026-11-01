'use strict';
const {copy,fail}=require('./schema.cjs');
function createWorker({ledger,sim,clock}){
 function fence(task,op){const approval=task.approvals[op.approval_ref];if(!approval||approval.revoked||approval.consumed_by!==op.id||approval.terms_hash!==op.terms_hash)fail('approval_invalid','human_review');if(!(clock()<approval.expires_at))fail('approval_expired','human_review');if(task.revoked)fail('scope_revoked');if(task.state_version!==op.state_version||task.cancellation_epoch!==op.cancellation_epoch)fail('cancelled');}
 const stale=(task,op)=>task.revoked||task.state_version!==op.state_version||task.cancellation_epoch!==op.cancellation_epoch;
 async function dispatch(principal,args,{forwardingOnly=false,replay=false}={}){
  const name=replay?'replay_same_key':'complete_checkout_session';let claimed=false;
  try{await ledger.workerMutation(principal,name,args,(task,op)=>{fence(task,op);if(replay){if(op.status!=='unknown'||op.lookup_status!=='absent')fail('reconciliation_required','reconcile');}else if(forwardingOnly){if(op.status!=='queued_forwarding'||!op.merchant_order)fail('recovery_not_permitted');}else if(op.status!=='queued')return;
   op.status='dispatching';task.outbox=task.outbox.filter(x=>x.operation_ref!==op.id);claimed=true;
  });}catch(error){if(['approval_invalid','approval_expired','cancelled','scope_revoked'].includes(error.code))await ledger.recordOutcome(principal,args.task_ref,args.operation_ref,(task,op)=>{op.status='rejected';op.error_code=error.code;task.outbox=task.outbox.filter(x=>x.operation_ref!==op.id);});throw error;}
  if(!claimed)return ledger.getOperation(principal,args.task_ref,args.operation_ref);
  let op=ledger.getOperation(principal,args.task_ref,args.operation_ref),merchant=op.merchant_order,forwarder=null;
  try{
   if(!forwardingOnly)merchant=await sim.merchant.submit({key:op.provider_key,preview:op.preview});
   if(op.preview.route==='forwarder')forwarder=await sim.forwarder.book({key:op.provider_key+'_forwarder',merchantOrder:merchant,preview:op.preview});
   await ledger.recordOutcome(principal,args.task_ref,op.id,(task,row)=>{row.merchant_order=merchant;row.forwarder_order=forwarder;row.status=stale(task,row)?'unknown':'completed';if(row.status==='unknown'&&!task.revoked)task.outbox.push({operation_ref:row.id,kind:'reconcile'});});
  }catch(error){await ledger.recordOutcome(principal,args.task_ref,op.id,(task,row)=>{if(merchant)row.merchant_order=merchant;if(error.code==='forwarding_failed'&&merchant){row.status='partial';}else if(['out_of_stock','terms_changed','identity_conflict'].includes(error.code)){row.status='rejected';row.error_code=error.code;}else{row.status='unknown';row.lookup_status=null;task.outbox.push({operation_ref:row.id,kind:'reconcile'});} });}
  return ledger.getOperation(principal,args.task_ref,op.id);
 }
 async function reconcile(principal,args){let allowed=false;await ledger.workerMutation(principal,'reconcile_operation',args,(task,op)=>{if(!['unknown','partial'].includes(op.status))return;task.outbox=task.outbox.filter(x=>!(x.operation_ref===op.id&&x.kind==='reconcile'));allowed=true;});if(!allowed)return ledger.getOperation(principal,args.task_ref,args.operation_ref);
  const op=ledger.getOperation(principal,args.task_ref,args.operation_ref),lookup=await sim.merchant.lookup(op.provider_key);let forwarding=op.forwarder_order;
  if(lookup.status==='found'&&op.preview.route==='forwarder'&&!forwarding){const task=ledger.snapshot(principal,args.task_ref);if(!stale(task,op)&&clock()<op.preview.expires_at){try{forwarding=await sim.forwarder.book({key:op.provider_key+'_forwarder',merchantOrder:lookup.record,preview:op.preview});}catch{/* Keep the merchant order; trusted forwarding-only recovery is required. */}}}
  await ledger.recordOutcome(principal,args.task_ref,op.id,(task,row)=>{row.lookup_status=lookup.status;if(lookup.status==='found'){row.merchant_order=lookup.record;row.forwarder_order=forwarding;row.status=stale(task,row)?'unknown':row.preview.route==='forwarder'&&!forwarding?'partial':'completed';}else row.status='unknown';});return ledger.getOperation(principal,args.task_ref,op.id);
 }
 async function paymentLink(principal,args){return ledger.workerMutation(principal,'create_payment_link',args,(task,op)=>{fence(task,op);return {operation_ref:op.id,url:'https://example.invalid/checkout/'+op.id};});}
 async function drain(principal,taskRef){const pending=copy(ledger.snapshot(principal,taskRef).outbox),results=[];for(const job of pending){const task=ledger.snapshot(principal,taskRef),args={task_ref:taskRef,operation_ref:job.operation_ref,request_id:job.kind+'_'+job.operation_ref+'_'+task.operations[job.operation_ref].operation_revision,expected_version:task.state_version,cancellation_epoch:task.cancellation_epoch};try{if(job.kind==='read_refresh'){results.push(await ledger.recordOutcome(principal,taskRef,job.operation_ref,(current,op)=>{if(op.kind!=='refresh')fail('refresh_not_permitted');op.status=stale(current,op)?'cancelled':'synthetic_refresh_completed';current.outbox=current.outbox.filter(j=>j.operation_ref!==op.id);}));}else results.push(job.kind==='reconcile'?await reconcile(principal,args):await dispatch(principal,args,{forwardingOnly:job.kind==='forwarding'}));}catch(error){results.push({synthetic:true,error_code:error.code});}}return results;}
 return {dispatch,reconcile,paymentLink,drain,replay:(p,a)=>dispatch(p,a,{replay:true})};
}
module.exports={createWorker};
