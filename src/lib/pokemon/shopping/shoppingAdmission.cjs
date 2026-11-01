'use strict';
const {copy,fail,hash,tools,validateRequest}=require('./schema.cjs');
const {scopeKey,minor}=require('./evidence.cjs');
function createShoppingAdmission({auth,evidence,clock,checkAction}){
 const plans=new WeakMap();
 function admit(principal,name,args,task){
  const actor=auth.meta(principal),schema=tools[name];if(!schema||!schema['x-callers'].includes(actor.role))fail('model_principal_denied');validateRequest(name,args);if(args.task_ref!==task.id||task.owner!==scopeKey(actor))fail('scope_denied');if(task.revoked)fail('scope_revoked');
  if(args.expected_version!==task.state_version)fail('version_conflict');
  if(args.cancellation_epoch!==task.cancellation_epoch)fail('cancelled');
  if(['select_offer','create_checkout_session','approve_purchase','request_refresh'].includes(name)&&Object.values(task.operations).some(o=>['queued','queued_forwarding','dispatching','unknown','partial'].includes(o.status)))fail('execution_read_only');
  if(actor.role==='model'&&Object.values(task.operations).some(o=>['queued','dispatching','unknown','partial'].includes(o.status)))fail('execution_read_only');
  if(['select_offer','approve_purchase','request_after_sales','recover_operation'].includes(name)&&!checkAction(task,name,args))fail('human_action_required');
  if(name==='select_offer'){
   const req=args.requirements,o=evidence.offer(args.offer_ref);if(!evidence.qualified(o,req))fail('identity_conflict','human_review');if(!minor(req.budget_minor)||!evidence.data.destinations.some(d=>d.id===req.destination_ref))fail('invalid_requirements');
   if(req.budget_basis==='item'&&BigInt(o.price_minor)>BigInt(req.budget_minor))fail('budget_exceeded','human_review');
  }
  if(name==='create_checkout_session'){
   const selection=task.selection;if(!selection||selection.id!==args.selection_ref||!evidence.qualified(evidence.offer(selection.offer_ref),task.accepted))fail('selection_stale','read_refresh');
   if(args.quantity!==task.accepted.quantity||args.destination_ref!==task.accepted.destination_ref||args.route!==task.accepted.route)fail('quote_binding_invalid','human_review');
  }
  if(name==='approve_purchase'){
   const q=task.preview;if(!q||q.id!==args.preview_ref||q.status!=='complete'||!task.selection)fail('preview_not_approvable','human_review');
   if(Object.values(task.operations).some(o=>o.preview?.id===q.id))fail('approval_consumed');
   if(!(clock()<q.expires_at))fail('approval_expired','human_review');
   if(q.total_minor===null||!minor(q.total_minor)||q.currency!==task.accepted.currency)fail('partial_quote','human_review');
   const amount=task.accepted.budget_basis==='item'?q.item_minor:q.total_minor;if(BigInt(amount)>BigInt(task.accepted.budget_minor))fail('budget_exceeded','human_review');
   if(q.offer_evidence_ref!==task.selection.evidence_ref||evidence.offer(task.selection.offer_ref)?.evidence_ref!==task.selection.evidence_ref||!evidence.qualified(evidence.offer(task.selection.offer_ref),task.accepted))fail('identity_conflict','human_review');
  }
  const plan=Object.freeze({name,task_ref:task.id,state_version:task.state_version,cancellation_epoch:task.cancellation_epoch,payload_hash:hash(args),owner:task.owner});plans.set(plan,{used:false});return plan;
 }
 function validate(plan,task,{consume=false}={}){const p=plans.get(plan);if(!p||p.used||task.id!==plan.task_ref||task.owner!==plan.owner||task.state_version!==plan.state_version||task.cancellation_epoch!==plan.cancellation_epoch||task.revoked&&!plan.archival)fail('shopping_admission_required');if(consume)p.used=true;return copy(plan);}
 function control(principal,task,name){const actor=auth.meta(principal),archival=name==='record_outcome';if(actor.role!==(archival?'worker':'ui')||task.owner!==scopeKey(actor)||!['create','cancel','revoke','record_outcome'].includes(name))fail('principal_denied');const plan=Object.freeze({name,task_ref:task.id,state_version:task.state_version,cancellation_epoch:task.cancellation_epoch,payload_hash:hash(name),owner:task.owner,archival});plans.set(plan,{used:false});return plan;}
 return {admit,validate,control};
}
module.exports={createShoppingAdmission};
