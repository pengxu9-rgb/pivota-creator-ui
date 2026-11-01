'use strict';
// Test/harness composition root. There is deliberately no HTTP or model transport.
const {issuer,tools,declarations,validateRequest,validateEnvelope,schemas,copy,fail,errorShape}=require('./schema.cjs');
const {createEvidence,scopeKey}=require('./evidence.cjs');
const {explore,offersFor,compare}=require('./exploration.cjs');
const {createLedger}=require('./ledger.cjs');
const {createSimulators}=require('./simulators.cjs');
const {createWorker}=require('./worker.cjs');
const {renderClaim,renderAssumptions}=require('./render.cjs');
const recordKeys=new Set(Object.keys(schemas['common.schema.json'].$defs.record.properties));
function createShopping({catalog,clock,beforeCommit,nativeProbe}={}){
 const auth=issuer(),evidence=createEvidence(catalog,clock),ledger=createLedger({auth,evidence,clock,beforeCommit}),sim=createSimulators({evidence,clock}),worker=createWorker({ledger,sim,clock}),audit=[];
 const issuePrincipal=(scope,role)=>auth.issue(scope,role);
 const publicRecord=(input,binding)=>evidence.put(Object.fromEntries(Object.entries(input).filter(([key])=>recordKeys.has(key))),binding);
 const bind=(task,kind,revision)=>({task_ref:task.id,owner:task.owner,kind,revision});
 function opRecord(task,op){return publicRecord({synthetic:true,id:op.id,kind:'operation',operation_ref:op.id,status:op.status,state_version:task.state_version,operation_revision:op.operation_revision,observed_at:clock(),expires_at:clock()+300000},bind(task,'operation',op.operation_revision));}
 function previewRecord(task){return publicRecord({...task.preview,quote_ref:task.preview.id,task_ref:task.id},bind(task,'preview'));}
 function selectionRecord(task){const offer=evidence.offer(task.selection.offer_ref);return publicRecord({...offer,evidence_ref:undefined,id:task.selection.id,kind:'selection',selection_ref:task.selection.id,task_ref:task.id},bind(task,'selection'));}
 async function call(principal,name,input){let task,actor;try{
  actor=auth.meta(principal);const contract=tools[name];
  // Capability checking precedes payload parsing, caching and every endpoint.
  if(!contract||!contract['x-callers'].includes(actor.role))fail('model_principal_denied');
  const args=validateRequest(name,input);task=ledger.snapshot(principal,args.task_ref);
  if(actor.role==='model'&&Object.values(task.operations).some(o=>['queued','queued_forwarding','dispatching','unknown','partial'].includes(o.status))&&!['get_operation','get_order'].includes(name))fail('execution_read_only');
  let records=[],assumptions=[],operation_ref=null,status='observed',original_text;
  switch(name){
   case 'search_catalog':{const found=explore(evidence,args.text,{nativeCall:nativeProbe});records=[...found.printings.map(p=>evidence.read(p.id)),...found.offers];assumptions=found.assumptions;original_text=found.original_text;break;}
   case 'get_product':{const p=evidence.printing(args.printing_ref);if(!p)fail('product_not_found');records=[evidence.read(p.id)];break;}
   case 'get_alternatives':{const p=evidence.printing(args.printing_ref);if(!p)fail('product_not_found');records=evidence.data.printings.filter(r=>r.name===p.name&&r.id!==p.id).map(r=>evidence.read(r.id));break;}
   case 'get_offers':records=offersFor(evidence,args.printing_refs,args.text||'');original_text=args.text||'';break;
   case 'compare_offers':{const ordered=compare(evidence,args.offer_refs,args.criterion);records=[...ordered,...ordered.map(o=>evidence.read(o.seller_ref)).filter(s=>evidence.current(s,86400000))];break;}
   case 'lookup_certificate':{const cert=evidence.read(args.certificate_ref),offer=evidence.offer(args.offer_ref);if(cert.kind!=='certificate'||!evidence.current(cert,86400000)||!evidence.qualified(offer)||cert.printing_ref!==offer.printing_ref||cert.grade_company!==offer.grade_company||cert.grade_value!==offer.grade_value)fail('certificate_conflict');records=[cert];break;}
   case 'select_offer':{const selected=await ledger.select(principal,args);task=ledger.snapshot(principal,args.task_ref);if(task.selection?.id!==selected.selection_ref)fail('selection_stale');records=[selectionRecord(task)];status='selected';break;}
   case 'create_checkout_session':{if(!task.selection||task.selection.id!==args.selection_ref)fail('selection_stale');const quote=sim.quote(task.selection.offer_ref,task.accepted),created=await ledger.preview(principal,args,quote);task=ledger.snapshot(principal,args.task_ref);if(task.preview?.id!==created.preview_ref)fail('preview_not_found');records=[previewRecord(task)];status=task.preview.status;break;}
   case 'get_checkout_session':if(task.preview?.id!==args.preview_ref)fail('preview_not_found');records=[previewRecord(task)];status=task.preview.status;break;
   case 'approve_purchase':{const result=await ledger.approveAndEnqueue(principal,args);operation_ref=result.operation_ref;task=ledger.snapshot(principal,args.task_ref);const op=ledger.getOperation(principal,args.task_ref,operation_ref);records=[opRecord(task,op)];status=op.status;break;}
   case 'get_operation':case 'get_order':{const op=ledger.getOperation(principal,args.task_ref,args.operation_ref);operation_ref=op.id;status=op.status;records=[opRecord(task,op)];if(name==='get_order')for(const order of [op.merchant_order,op.forwarder_order].filter(Boolean))records.push(publicRecord({...order,operation_ref:op.id},bind(task,'operation',op.operation_revision)));break;}
   case 'request_refresh':{operation_ref=(await ledger.requestRefresh(principal,args)).operation_ref;task=ledger.snapshot(principal,args.task_ref);records=[opRecord(task,ledger.getOperation(principal,args.task_ref,operation_ref))];status='queued_read_refresh';break;}
   case 'complete_checkout_session':case 'reconcile_operation':case 'replay_same_key':{const op=await worker[name==='complete_checkout_session'?'dispatch':name==='reconcile_operation'?'reconcile':'replay'](principal,args);task=ledger.snapshot(principal,args.task_ref);operation_ref=op.id;records=[opRecord(task,op)];status=op.status;break;}
   case 'create_payment_link':{const link=await worker.paymentLink(principal,args);task=ledger.snapshot(principal,args.task_ref);operation_ref=link.operation_ref;const op=ledger.getOperation(principal,args.task_ref,operation_ref);records=[publicRecord({...opRecord(task,op),evidence_ref:undefined,url:link.url},bind(task,'operation',op.operation_revision))];status='synthetic_handoff_only';break;}
   case 'recover_operation':case 'request_after_sales':{const result=await ledger[name==='recover_operation'?'recover':'afterSales'](principal,args);operation_ref=result.operation_ref;task=ledger.snapshot(principal,args.task_ref);const op=ledger.getOperation(principal,args.task_ref,operation_ref);records=[opRecord(task,op)];status=op.status;break;}
   default:fail('invalid_request');
  }
  task=ledger.snapshot(principal,args.task_ref);const result={synthetic:true,tool:name,task_ref:task.id,state_version:task.state_version,records,assumptions,operation_ref,status};if(original_text!==undefined)result.original_text=original_text;
  return validateEnvelope({ok:true,result});
 }catch(error){if(actor?.role==='model')audit.push({synthetic:true,tool:name,code:error.code||'internal_error'});return validateEnvelope({ok:false,error:errorShape(error,task?.state_version||0,null)});}}
 return {call,declarations,ledger,evidence,sim,worker,issuePrincipal,audit:()=>copy(audit),createTask:p=>ledger.createTask(p),issueAction:(p,n,a)=>ledger.issueAction(p,n,a),render:(p,taskRef,claim)=>renderClaim({evidence,task:ledger.snapshot(p,taskRef),clock,claim}),renderAssumptions};
}
module.exports={createShopping};
