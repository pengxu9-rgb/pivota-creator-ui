'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {admit}=require('../src/lib/pokemon/admission.cjs');
const {createCatalogAdapter}=require('../src/lib/pokemon/catalogAdapter.cjs');
const {createPrivateCollectorWorkspace,createMemoryStore}=require('../src/lib/pokemon/vendor/privateCollector.cjs');
const context={id:'offline-adapter-owner'};
const authenticate=async ctx=>({id:ctx.id});
const OWNER=createHash('sha256').update(context.id).digest('hex');
const CARD='en:SV03.5:006/165:holo',BAD='ja:SV2a:006/165:holo';
function result(language='en'){
  return {status:'candidate_clarification_needed',catalog_revision:'a'.repeat(64),
    scope_filters:{language},discovery:{languages:[language]},preferences:{},
    candidate_cards:[{card_id:CARD,name:'Charizard',language:'en'}],selection_allowed:true,
    next_step:{field:'select',prompt:'Choose a target.'}};
}
function harness(){
  let time=1000,next=null,calls=0;const rows=createMemoryStore(),writes=[];
  const store={...rows,async put(owner,id,value){writes.push(structuredClone(value));await rows.put(owner,id,value);}};
  const client={async advance({action,session}){
    calls++;let value=next?await next({action,session}):result();
    if(action.type==='select')value={...value,status:'catalog_target_selected',selected_catalog_target:{card_id:CARD,name:'Charizard'},
      target_intent:{card_id:CARD,transaction_ready:false,physical_printing_verified:false,public_display_allowed:false,automatic_offer_join_allowed:false}};
    return {status:'accepted',session:{read:calls},result:value,next_step:value.next_step};
  }};
  const makeRaw=()=>createPrivateCollectorWorkspace({client,authenticate,store,now:()=>time});
  const workspace=makeRaw(),adapter=createCatalogAdapter({workspace,authenticate,now:()=>time});
  const binding=current=>({owner:OWNER,chatId:'offline-chat',stateVersion:2,workspaceId:current?.id??null,workspaceVersion:current?.version??null,deadline:10000});
  const plan=(action,current=null,scope=binding(current))=>admit({candidate:{action},text:action.question||'',ingress:'typed',binding:scope,current,now:()=>time});
  return {workspace,adapter,binding,plan,writes,makeRaw,get calls(){return calls;},set next(fn){next=fn;},set time(v){time=v;}};
}
const execute=(h,plan,current=null)=>h.adapter.execute(context,plan,{binding:h.binding(current),deadline:10000});

test('raw workspace rejects unbranded start, advance and save before any catalog call',async()=>{
  const h=harness();
  await assert.rejects(h.workspace.start(context,{question:'English Charizard cards',limit:5}),/catalog_admission_required/);
  await assert.rejects(h.workspace.advance(context,{id:'a'.repeat(36),version:0,action:{type:'ask',question:'English Charizard cards'}}),/catalog_admission_required/);
  await assert.rejects(h.workspace.save(context,{id:'a'.repeat(36),version:0}),/catalog_admission_required/);
  assert.equal(h.calls,0);assert.equal(h.writes.length,0);
});

test('facade rejects copied, serialized and reflected plans while admitting the original exactly once',async()=>{
  const h=harness(),plan=h.plan({type:'ask',question:'English Charizard cards'});
  for(const forged of [structuredClone(plan),JSON.parse(JSON.stringify(plan)),Object.defineProperties({},Object.getOwnPropertyDescriptors(plan))])
    await assert.rejects(execute(h,forged),/catalog_admission_required/);
  const current=await execute(h,plan);
  assert.equal(current.result.scope_filters.language,'en');assert.equal(h.calls,1);
  await assert.rejects(execute(h,plan),/catalog_admission_consumed/);
  assert.equal(h.calls,1);
});

test('facade binds all owner, chat, state, workspace, version and deadline fields',async()=>{
  const h=harness(),plan=h.plan({type:'ask',question:'English Charizard cards'}),binding=h.binding();
  for(const [field,value] of Object.entries({owner:'other',chatId:'other',stateVersion:3,workspaceId:'other',workspaceVersion:1,deadline:9999})){
    await assert.rejects(h.adapter.execute(context,plan,{binding:{...binding,[field]:value}}),/catalog_admission_scope_mismatch/);
  }
  assert.equal(h.calls,0);
  await execute(h,plan);assert.equal(h.calls,1);
});

test('admission expiry is checked before dispatch and again before native publication',async()=>{
  const h=harness(),expired=h.plan({type:'ask',question:'English Charizard cards'});
  h.time=10000;await assert.rejects(execute(h,expired),/catalog_admission_expired/);assert.equal(h.calls,0);
  h.time=1000;const current=await execute(h,h.plan({type:'ask',question:'English Charizard cards'}));
  const plan=h.plan({type:'ask',question:'English Pikachu cards'},current);
  h.next=()=>{h.time=10000;return {...result(),marker:'expired-response'};};
  await assert.rejects(execute(h,plan,current),/catalog_admission_expired/);
  assert.equal(h.writes.some(w=>w.result?.marker==='expired-response'),false);
  const restored=await h.makeRaw().get(context,current.id);
  assert.equal(restored.version,current.version);assert.equal(restored.saved_decision,null);assert.equal(restored.needs_reconfirmation,true);
});

for(const field of ['discovery.languages','scope_filters.language','preferences'])test('native '+field+' mismatch is rejected before persistence, including reopen and selection',async()=>{
  const h=harness(),current=await execute(h,h.plan({type:'ask',question:'English Charizard cards'}));
  const plan=h.plan({type:'ask',question:'English Pikachu cards'},current);
  h.next=()=>{
    const r={...result(),marker:'unadmitted',candidate_cards:[{card_id:BAD,name:'bad',language:field==='scope_filters.language'?'ja':'en'}]};
    if(field==='discovery.languages')r.discovery={languages:['ja']};
    if(field==='scope_filters.language')r.scope_filters={language:'ja'};
    // A saved preference must not disappear or change in the native echo.
    if(field==='preferences')r.preferences={budget_minor:200,currency:'USD'};
    return r;
  };
  // preferences may only be compared against admitted values; make one explicit.
  let pending=plan;
  if(field==='preferences')pending=h.plan({type:'preferences',preferences:{budget_minor:100,currency:'USD'}},current);
  await assert.rejects(execute(h,pending,current),/catalog_admission_echo_mismatch/);
  assert.equal(h.writes.some(w=>w.result?.marker==='unadmitted'),false,'bad replay must never be persisted even briefly');
  const restored=await h.makeRaw().get(context,current.id);
  assert.equal(restored.result.marker,undefined);assert.equal(restored.result.candidate_cards[0].card_id,CARD);
  assert.equal(restored.saved_decision,null);assert.equal(restored.needs_reconfirmation,true);
  assert.throws(()=>h.plan({type:'select',card_id:BAD},restored),/catalog_rejected_action|invalid_action/);
  await assert.rejects(h.workspace.save(context,{id:restored.id,version:restored.version}),/catalog_admission_required/);
});

test('save is available only for the same admitted selection invocation, once',async()=>{
  const h=harness(),current=await execute(h,h.plan({type:'ask',question:'English Charizard cards'}));
  const plan=h.plan({type:'select',card_id:CARD},current),binding=h.binding(current),selected=await execute(h,plan,current);
  const saved=await h.adapter.save(context,plan,selected,{binding,deadline:10000});
  assert.equal(saved.saved_decision.card_id,CARD);assert.equal(saved.needs_reconfirmation,false);
  await assert.rejects(h.adapter.save(context,plan,selected,{binding,deadline:10000}),/catalog_admission_scope_mismatch/);
  const other=h.plan({type:'select',card_id:CARD},current);
  await assert.rejects(h.adapter.save(context,other,selected,{binding,deadline:10000}),/catalog_admission_scope_mismatch/);
});

test('echo failure withdraws a previously saved target before reopening',async()=>{
  const h=harness(),first=await execute(h,h.plan({type:'ask',question:'English Charizard cards'}));
  const selection=h.plan({type:'select',card_id:CARD},first),binding=h.binding(first);
  const selected=await execute(h,selection,first);
  const saved=await h.adapter.save(context,selection,selected,{binding,deadline:10000});
  assert.equal(saved.saved_decision.card_id,CARD);
  h.next=()=>({...result('ja'),marker:'must-not-publish'});
  await assert.rejects(execute(h,h.plan({type:'ask',question:'English Pikachu cards'},saved),saved),/catalog_admission_echo_mismatch/);
  const reopened=await h.makeRaw().get(context,saved.id);
  assert.equal(reopened.result.marker,undefined);assert.equal(reopened.saved_decision,null);
  assert.equal(reopened.needs_reconfirmation,true);assert.equal(reopened.version,saved.version);
  assert.equal(h.writes.some(w=>w.result?.marker==='must-not-publish'),false);
});

test('commerce boundary accepts only a branded plan bound to the exact operation and task',async()=>{
  const h=harness(),current={id:'offline-workspace',version:1,result:result()},binding=h.binding(current),request={card_id:CARD};
  const doc={id:binding.chatId,version:binding.stateVersion,requiresReconfirmation:false,messages:[{role:'assistant',status:'accepted',cards:[{card_id:CARD}]}]};
  const payload={id:doc.id,version:doc.version,request_id:'offline-request',operation:'research',request};
  const makePlan=()=>admit({candidate:{operation:'research',request},ingress:'commerce',binding,current,doc,now:()=>1000});
  let calls=0;
  const begin=(received,action,time)=>{calls++;assert.equal(received,doc);assert.equal(time,1000);assert.deepEqual(action,payload);return {reserved:true};};
  await assert.rejects(h.adapter.beginCommerce(context,structuredClone(makePlan()),{binding,payload,doc,begin}),/catalog_admission_required/);
  await assert.rejects(h.adapter.beginCommerce(context,makePlan(),{binding,payload:{...payload,operation:'psa'},doc,begin}),/catalog_admission_scope_mismatch/);
  await assert.rejects(h.adapter.beginCommerce(context,makePlan(),{binding,payload:{...payload,request:{card_id:BAD}},doc,begin}),/catalog_admission_scope_mismatch/);
  await assert.rejects(h.adapter.beginCommerce(context,makePlan(),{binding,payload,doc:{...doc,version:3},begin}),/catalog_admission_scope_mismatch/);
  const plan=makePlan();assert.deepEqual(await h.adapter.beginCommerce(context,plan,{binding,payload,doc,begin}),{reserved:true});
  await assert.rejects(h.adapter.beginCommerce(context,plan,{binding,payload,doc,begin}),/catalog_admission_consumed/);
  assert.equal(calls,1);assert.equal(h.calls,0);
});
