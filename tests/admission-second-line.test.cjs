'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {admit}=require('../src/lib/pokemon/admission.cjs');
const {createCatalogAdapter,validateInvocation}=require('../src/lib/pokemon/catalogAdapter.cjs');
const {createPrivateCollectorWorkspace,createMemoryStore}=require('../src/lib/pokemon/vendor/privateCollector.cjs');
const context={id:'second-line-offline-owner'},OTHER_CONTEXT={id:'another-offline-owner'};
const OWNER=createHash('sha256').update(context.id).digest('hex'),CARD='en:SV03.5:006/165:holo';
const authenticate=async ctx=>({id:ctx.id});
function result(selected=false){
  return {status:selected?'catalog_target_selected':'candidate_clarification_needed',catalog_revision:'a'.repeat(64),
    scope_filters:{language:'en'},discovery:{languages:['en']},preferences:{},
    candidate_cards:[{card_id:CARD,name:'Charizard',language:'en'}],selection_allowed:true,
    next_step:{field:'select',prompt:'Choose a target.'},...(selected?{
      selected_catalog_target:{card_id:CARD,name:'Charizard'},target_intent:{card_id:CARD,
        transaction_ready:false,physical_printing_verified:false,public_display_allowed:false,automatic_offer_join_allowed:false}}:{})};
}
function harness(){
  const rows=createMemoryStore(),writes=[];let calls=0;
  const store={...rows,async put(owner,id,value){writes.push(structuredClone(value));return rows.put(owner,id,value);}};
  const client={async advance({action}){calls++;const value=result(action.type==='select');
    return {status:'accepted',session:{offline_read:calls},result:value,next_step:value.next_step};}};
  const workspace=createPrivateCollectorWorkspace({client,authenticate,store,now:()=>1000});
  const adapter=createCatalogAdapter({workspace,authenticate,now:()=>1000});
  const binding=current=>({owner:OWNER,chatId:'second-line-offline-chat',stateVersion:2,
    workspaceId:current?.id??null,workspaceVersion:current?.version??null,deadline:10000});
  const plan=(action,current=null)=>admit({candidate:{action},text:action.question||'',ingress:'typed',
    binding:binding(current),current,now:()=>1000});
  const execute=(action,current=null)=>adapter.execute(context,plan(action,current),{binding:binding(current),deadline:10000});
  // Wrap methods on the actual workspace. The adapter and the workspace's api
  // closure retain the same object identity; tokens are issued by the facade.
  const intercept=(name,handler)=>{const original=workspace[name];workspace[name]=function(...args){return handler(original.bind(workspace),...args);};};
  return {workspace,adapter,rows,writes,binding,plan,execute,intercept,get calls(){return calls;}};
}

test('facade authenticates the plan owner before issuing any raw workspace invocation',async()=>{
  const h=harness(),plan=h.plan({type:'ask',question:'English Charizard cards'});let reachedWorkspace=0;
  h.intercept('start',async()=>{reachedWorkspace++;throw Error('owner check reached workspace too late');});
  await assert.rejects(h.adapter.execute(OTHER_CONTEXT,plan,{binding:h.binding(),deadline:10000}),/catalog_admission_scope_mismatch/);
  assert.equal(reachedWorkspace,0);assert.equal(h.calls,0);assert.equal(h.writes.length,0);
});

test('a genuinely issued start token cannot authorize a different question',async()=>{
  const h=harness();let captured;
  h.intercept('start',async(original,ctx,payload,options)=>{captured=options.admission;
    assert.ok(captured);assert.equal(Object.isFrozen(captured),true);
    return original(ctx,{...payload,question:'English Pikachu cards'},options);});
  await assert.rejects(h.execute({type:'ask',question:'English Charizard cards'}),/catalog_admission_scope_mismatch/);
  assert.ok(captured);assert.equal(h.calls,0);assert.equal(h.writes.length,0);
});

test('a genuinely issued advance token cannot authorize a different admitted action',async()=>{
  const h=harness(),current=await h.execute({type:'ask',question:'English Charizard cards'}),before=h.calls;
  h.intercept('advance',(original,ctx,payload,options)=>original(ctx,{...payload,
    action:{type:'ask',question:'English Pikachu cards'}},options));
  await assert.rejects(h.execute({type:'ask',question:'English Mew cards'},current),/catalog_admission_scope_mismatch/);
  assert.equal(h.calls,before);
  assert.equal((await h.workspace.get(context,current.id)).version,current.version);
});

test('a genuinely issued token is consumed once even while its admitted plan remains valid',async()=>{
  const h=harness();let captured;
  h.intercept('start',async(original,ctx,payload,options)=>{
    captured=options.admission;const first=await original(ctx,payload,options);
    await assert.rejects(original(ctx,payload,{...options,admission:captured}),/catalog_admission_required/);
    return first;
  });
  await h.execute({type:'ask',question:'English Charizard cards'});
  assert.ok(captured);assert.equal(h.calls,1);assert.equal((await h.workspace.list(context)).length,1);
});

for(const field of ['owner','workspaceId','workspaceVersion'])test('issued token independently binds '+field+' at the private workspace boundary',async()=>{
  const h=harness(),current=await h.execute({type:'ask',question:'English Charizard cards'});
  h.intercept('advance',async(original,ctx,payload,options)=>{
    const scope={owner:OWNER,workspaceId:current.id,workspaceVersion:current.version};
    const other=field==='owner'?'b'.repeat(64):field==='workspaceId'?'f'.repeat(36):current.version+1;
    assert.throws(()=>validateInvocation(options.admission,h.workspace,{...scope,[field]:other}),/catalog_admission_scope_mismatch/);
    assert.equal(validateInvocation(options.admission,h.workspace,scope).action.question,'English Pikachu cards');
    return original(ctx,payload,options);
  });
  const updated=await h.execute({type:'ask',question:'English Pikachu cards'},current);
  assert.equal(updated.version,current.version+1);assert.equal(h.calls,2);
});

test('issued token cannot be transferred to another private workspace object',async()=>{
  const h=harness(),other=harness();
  h.intercept('start',async(original,ctx,payload,options)=>{
    await assert.rejects(other.workspace.start(ctx,payload,options),/catalog_admission_required/);
    return original(ctx,payload,options);
  });
  await h.execute({type:'ask',question:'English Charizard cards'});
  assert.equal(h.calls,1);assert.equal(other.calls,0);assert.equal(other.writes.length,0);
});

test('private save rechecks the stored publication echo after the facade has checked its view',async()=>{
  const h=harness(),current=await h.execute({type:'ask',question:'English Charizard cards'});
  const plan=h.plan({type:'select',card_id:CARD},current),binding=h.binding(current);
  const selected=await h.adapter.execute(context,plan,{binding,deadline:10000});
  h.intercept('save',async(original,ctx,payload,options)=>{
    const record=await h.rows.get(OWNER,payload.id);
    record.result.discovery.languages=['ja'];record.result.marker='changed-between-view-and-save';
    await h.rows.put(OWNER,payload.id,record);
    return original(ctx,payload,options);
  });
  await assert.rejects(h.adapter.save(context,plan,selected,{binding,deadline:10000}),/catalog_admission_echo_mismatch/);
  const reopened=await h.workspace.get(context,selected.id);
  assert.equal(reopened.saved_decision,null);assert.equal(reopened.version,selected.version);
  assert.equal(h.writes.some(row=>row.savedDecision?.card_id===CARD),false);
});

test('commerce checks the payload version independently of the matching document and plan',async()=>{
  const h=harness(),current={id:'offline-workspace',version:1,result:result()},binding=h.binding(current),request={card_id:CARD};
  const doc={id:binding.chatId,version:binding.stateVersion,requiresReconfirmation:false,
    messages:[{role:'assistant',status:'accepted',cards:[{card_id:CARD}]}]};
  const plan=admit({candidate:{operation:'research',request},ingress:'commerce',binding,current,doc,now:()=>1000});
  const payload={id:binding.chatId,version:binding.stateVersion+1,request_id:'offline-request',operation:'research',request};let began=0;
  await assert.rejects(h.adapter.beginCommerce(context,plan,{binding,payload,doc,begin:()=>{began++;return {reserved:true};}}),/catalog_admission_scope_mismatch/);
  assert.equal(began,0);assert.equal(h.calls,0);
});

test('text proposals that bypass typed ingress still receive final typed-action validation',()=>{
  const h=harness();
  for(const action of [{type:'page',offset:-1},{type:'page',offset:1,unexpected:true},{type:'inventory',owned_items:'not-an-array'}])
    assert.throws(()=>admit({candidate:{action},text:'continue',ingress:'text',binding:h.binding(),now:()=>1000}),/invalid_action/);
  assert.equal(h.calls,0);assert.equal(attempts.length,0);
});

test('printed set-code binding remains independent of the pinned release-name vocabulary',()=>{
  const h=harness(),current={id:'offline-workspace',version:1,result:result()};
  const single=h.plan({type:'ask',question:'Find Charizard ZZ999'},current);
  assert.equal(single.hold,null);assert.equal(single.constraints.scope.set_code,'ZZ999');
  const multiple=h.plan({type:'ask',question:'Find Charizard ZZ999 ZZ998'},current);
  assert.equal(multiple.hold?.field,'compound');assert.equal(multiple.localOnly,true);
  assert.equal(h.calls,0);assert.equal(attempts.length,0);
});
