'use strict';

// This is the sole catalog capability facade. Candidate objects are deliberately
// insufficient: the kernel's private membership and the current task binding
// are rechecked before an invocation can reach the legacy workspace.
const {CollectorCallError,createCollectorClient}=require('./vendor/collectorClient.cjs');
const {createPrivateCollectorWorkspace}=require('./vendor/privateCollector.cjs');
const {createHash}=require('node:crypto');
const invocations=new WeakMap();
const fail=code=>{throw new CollectorCallError(code);};
const {validatePlan,nativeEcho}=require('./admission.cjs');

function createCatalogAdapter({workspace,authenticate,now=Date.now}={}) {
  if(!workspace||typeof workspace.start!=='function'||typeof workspace.advance!=='function')fail('catalog_adapter_not_configured');
  const executions=new WeakMap();
  async function actor(context,binding){
    if(typeof authenticate!=='function')return binding.owner;
    let principal;try{principal=await authenticate(context);}catch{fail('collector_caller_denied');}
    if(!principal||typeof principal.id!=='string'||!principal.id.trim()||principal.id.length>200)fail('collector_caller_denied');
    return createHash('sha256').update(principal.id).digest('hex');
  }
  function invocation(plan,binding,phase,recordVersion=null){
    const token=Object.freeze({});
    invocations.set(token,{workspace,plan,binding:Object.freeze({...binding}),phase,recordVersion,used:false,now});
    return token;
  }
  return Object.freeze({
    async execute(context,plan,{binding,signal,deadline}={}){
      if(!binding||await actor(context,binding)!==binding.owner)fail('catalog_admission_scope_mismatch');
      validatePlan(plan,binding,{consume:true,now});
      if(plan.kind!=='catalog'||plan.localOnly||plan.hold)fail('catalog_rejected_action');
      if(deadline!==undefined&&deadline!==binding.deadline)fail('catalog_admission_scope_mismatch');
      const token=invocation(plan,binding,'read'),options={signal,deadline:binding.deadline,admission:token};
      const result=binding.workspaceId===null?
        await workspace.start(context,{question:plan.action.question,limit:5},options):
        await workspace.advance(context,{id:binding.workspaceId,version:binding.workspaceVersion,action:plan.action},options);
      // Private workspaces check before persistence. This second check covers
      // injected adapters and catches a result modified after native admission.
      validatePlan(plan,binding,{now});
      const withdrawn=result?.result===null&&result?.saved_decision===null&&result?.needs_reconfirmation===true&&
        result?.next_step?.field==='restart_and_reconfirm';
      if(!withdrawn)nativeEcho(plan,result?.result);
      executions.set(plan,{binding,resultId:result.id,resultVersion:result.version,saved:false});
      return result;
    },
    async save(context,plan,current,{binding,signal,deadline}={}){
      const execution=executions.get(plan);
      if(!execution||execution.saved||plan.action.type!=='select'||!current||current.id!==execution.resultId||current.version!==execution.resultVersion)
        fail('catalog_admission_scope_mismatch');
      if(!binding||await actor(context,binding)!==binding.owner)fail('catalog_admission_scope_mismatch');
      validatePlan(plan,binding,{now});
      if(deadline!==undefined&&deadline!==binding.deadline)fail('catalog_admission_scope_mismatch');
      nativeEcho(plan,current.result);execution.saved=true;
      return workspace.save(context,{id:current.id,version:current.version},
        {signal,deadline:binding.deadline,admission:invocation(plan,binding,'save',current.version)});
    },
    async beginCommerce(context,plan,{binding,payload,doc,begin}={}){
      if(!binding||await actor(context,binding)!==binding.owner)fail('catalog_admission_scope_mismatch');
      validatePlan(plan,binding,{consume:true,now});
      if(plan.kind!=='commerce'||plan.hold||typeof begin!=='function'||!payload||!doc||
        payload.id!==binding.chatId||payload.version!==binding.stateVersion||doc.id!==binding.chatId||doc.version!==binding.stateVersion||
        payload.operation!==plan.operation||JSON.stringify(payload.request)!==JSON.stringify(plan.request))fail('catalog_admission_scope_mismatch');
      return begin(doc,{...payload,operation:plan.operation,request:structuredClone(plan.request)},now());
    },
    get:workspace.get.bind(workspace),
    ...(typeof workspace.list==='function'?{list:workspace.list.bind(workspace)}:{}),
    ...(typeof workspace.cancel==='function'?{cancel:workspace.cancel.bind(workspace)}:{}),
    ...(typeof workspace.delete==='function'?{delete:workspace.delete.bind(workspace)}:{}),
  });
}

// Called by the private workspace before reading state and again at the native
// publication boundary. The token cannot be copied, reconstructed or serialized.
function validateInvocation(token,workspace,{owner,workspaceId,workspaceVersion,phase='read'}, {consume=false}={}) {
  const invocation=token&&invocations.get(token);
  if(!invocation||invocation.workspace!==workspace||invocation.phase!==phase||consume&&invocation.used)fail('catalog_admission_required');
  const {binding,plan,now}=invocation;
  validatePlan(plan,binding,{now});
  const expectedVersion=phase==='save'?invocation.recordVersion:binding.workspaceVersion;
  const expectedId=binding.workspaceId;
  if(binding.owner!==owner||expectedId!==workspaceId||expectedVersion!==workspaceVersion)fail('catalog_admission_scope_mismatch');
  if(consume)invocation.used=true;
  return plan;
}
function validateNativePublication(token,workspace,scope,result) {
  const plan=validateInvocation(token,workspace,scope);
  nativeEcho(plan,result);
}

function createCatalogWorkspace({clientOptions,...options}={}) {
  const workspace=createPrivateCollectorWorkspace({...options,client:createCollectorClient(clientOptions)});
  return workspace;
}
module.exports={createCatalogAdapter,createCatalogWorkspace,validateInvocation,validateNativePublication};
