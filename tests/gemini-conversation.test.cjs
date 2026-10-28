'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createConversationService}=require('../src/lib/pokemon/conversations.cjs');
const {latestCatalogMessage}=require('../src/lib/pokemon/mobileAgent.cjs');
const {MAX_TIMEOUT_MS}=require('../src/lib/pokemon/geminiVertex.cjs');
const {PRIVATE_WORK_MS}=require('../src/lib/pokemon/requestBudgets.cjs');

const CARD={card_id:'en:SV03.5:006/165:holo',name:'Charizard ex',language:'en',set_code:'SV03.5',collector_number:'006/165',variant:'holo'};
const PREFS={grade_company:'PSA',grade_value:'10',budget_minor:100000,currency:'USD'};
const route=(action,languagePreference='en')=>({action,languagePreference,modelMeta:{status:'accepted',code:'accepted'}});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function harness(interpreter){
  const rows=new Map(),workspaces=new Map(),calls=[],contexts=[],writes=[],owner={id:'gemini-owner-a'};
  let interpret=interpreter,intercepts={};
  const store={
    async get(user,kind,id){return structuredClone(rows.get(user+'/'+kind+'/'+id)||null);},
    async put(user,kind,id,value){writes.push(structuredClone(value));rows.set(user+'/'+kind+'/'+id,structuredClone(value));},
    async list(user,kind){return [...rows].filter(([key])=>key.startsWith(user+'/'+kind+'/')).map(([,value])=>structuredClone(value));},
    async delete(user,kind,id){rows.delete(user+'/'+kind+'/'+id);},
  };
  const result=question=>({status:'candidate_clarification_needed',catalog_revision:'a'.repeat(64),goal_question:question,
    preferences:structuredClone(PREFS),scope_filters:{language:'en'},candidate_cards:[structuredClone(CARD)],selection_allowed:true,
    selected_catalog_target:null,next_step:{field:'number',prompt:'Which printed collector number?'},prices:[],live_offers:[]});
  const workspace={
    async start(context,payload,options){calls.push({method:'start',context,payload:structuredClone(payload),options});await intercepts.start?.(options);
      const value={id:randomUUID(),version:1,result:result(payload.question),saved_decision:null,needs_reconfirmation:true,transaction_ready:false};
      workspaces.set(value.id,value);return structuredClone(value);},
    async advance(context,payload,options){calls.push({method:'advance',context,payload:structuredClone(payload),options});await intercepts.advance?.(options);
      const value=workspaces.get(payload.id);assert.equal(payload.version,value.version);value.version++;
      const a=payload.action;
      if(a.type==='ask'){const prefs=value.result.preferences;value.result=result(a.question);value.result.preferences=prefs;value.saved_decision=null;value.needs_reconfirmation=true;}
      if(a.type==='refine')value.result.scope_filters={...value.result.scope_filters,...a.scope};
      if(a.type==='preferences')value.result.preferences={...value.result.preferences,...a.preferences};
      if(a.type==='select'){value.result.status='catalog_target_selected';value.result.selected_catalog_target=structuredClone(CARD);value.needs_reconfirmation=false;}
      return structuredClone(value);},
    async get(context,id){assert.ok(id,'local-only first turns must not call get(null)');return structuredClone(workspaces.get(id));},
    async save(context,payload){calls.push({method:'save',payload});const value=workspaces.get(payload.id);value.saved_decision={card_id:CARD.card_id};return structuredClone(value);},
  };
  const make=enabled=>createConversationService({workspace,authenticate:async context=>context?.id?{id:context.id}:null,store,
    ...(enabled===false?{}:{interpretTurn:async(input,options)=>{contexts.push(structuredClone(input));return interpret(input,options);}})});
  const service=make();
  return {owner,calls,contexts,writes,service,restore:make,setInterpreter:fn=>{interpret=fn;},intercepts,
    doc:id=>[...rows.values()].find(v=>v.id===id),
    mutate(id,fn){const pair=[...rows].find(([,v])=>v.id===id);fn(pair[1]);},
    send:(chat,text,options)=>service.send(owner,{id:chat.id,version:chat.version,text},options)};
}

test('model reservation is durable before interpretation, while context uses the accepted pre-submit version',async()=>{
  const h=harness(async input=>{
    const persisted=h.doc(chat.id);
    assert.equal(persisted.pending,true);assert.equal(persisted.modelCalls,1);
    assert.equal(persisted.modelPending.stateVersion,0);assert.equal(persisted.modelPending.workspaceVersion,null);
    assert.match(persisted.modelPending.requestId,/^[a-f0-9-]{36}$/);
    assert.equal(persisted.messages.at(-1).text,'Charizard 151/165');
    assert.equal(input.doc.version,0);assert.deepEqual(input.doc.messages,[]);assert.equal(input.current,null);
    return route({type:'ask',question:'English '+input.text});
  });
  let chat=await h.service.create(h.owner,{});chat=await h.send(chat,'Charizard 151/165');
  assert.equal(h.calls.length,1);assert.equal(h.calls[0].payload.question,'English Charizard 151/165');
  assert.ok(h.calls[0].options.deadline<=Date.now()+PRIVATE_WORK_MS,'catalog uses the existing total private-work budget');
  assert.ok(h.calls[0].options.deadline>Date.now()+PRIVATE_WORK_MS-1000);
  assert.equal(chat.messages[0].text,'Charizard 151/165');assert.equal(chat.target,null);
  assert.equal(h.doc(chat.id).modelCalls,1);assert.equal(h.doc(chat.id).modelPending,null);assert.equal(h.doc(chat.id).pending,null);
  assert.deepEqual(h.doc(chat.id).modelLast,{requestId:h.doc(chat.id).modelLast.requestId,status:'accepted',code:'accepted'});
});

test('first status, explanation and clarification turns do not need or create a workspace',async()=>{
  const h=harness(async({text})=>route(text==='status'?{type:'recommendation_status'}:text==='explain'?{type:'model_explanation',key:'prices_unavailable'}:{type:'model_clarification',field:'character',reason:'uncertain'},null));
  let chat=await h.service.create(h.owner,{});
  for(const text of ['status','explain','clarify']){chat=await h.send(chat,text);assert.equal(chat.workspace,null);assert.equal(chat.target,null);}
  assert.equal(h.calls.length,0);assert.match(chat.messages.at(-1).text,/character or illustrator/);
  assert.equal(chat.modelClarificationPending,true);
});

test('model status and explanations preserve an accepted target and existing card controls',async()=>{
  const h=harness(async({text})=>route(text==='initial'?{type:'ask',question:'English Charizard cards'}:text==='status'?{type:'recommendation_status'}:{type:'model_explanation',key:'current_results'}));
  let chat=await h.service.create(h.owner,{});chat=await h.send(chat,'initial');
  chat=await h.service.action(h.owner,{id:chat.id,version:chat.version,action:{type:'select',card_id:CARD.card_id}});
  assert.ok(chat.target);const selectedMessage=chat.messages.at(-1),before=h.calls.length,target=structuredClone(chat.target);
  h.mutate(chat.id,doc=>{doc.commerceAnchor={card_id:CARD.card_id,opaque:'retained'};});
  for(const text of ['status','explain']){
    chat=await h.send(chat,text);assert.deepEqual(chat.target,target);assert.equal(h.calls.length,before);
    assert.equal(latestCatalogMessage(chat.messages).id,selectedMessage.id);assert.equal(chat.messages.at(-1).catalogStatusOnly,true);
    assert.equal(h.doc(chat.id).commerceAnchor.opaque,'retained');
  }
});

test('generic model clarification survives reopen and blocks direct stale actions until accepted recovery',async()=>{
  const h=harness(async({text})=>route(text==='initial'?{type:'ask',question:'English Charizard cards'}:
    text==='compound'?{type:'model_clarification',field:'compound',reason:'uncertain'}:text==='status'?{type:'recommendation_status'}:
      text==='explain'?{type:'model_explanation',key:'current_results'}:{type:'reply',text:'006/165'}));
  let chat=await h.service.create(h.owner,{});chat=await h.send(chat,'initial');chat=await h.send(chat,'compound');
  assert.equal(chat.modelClarificationPending,true);assert.equal(chat.target,null);assert.equal(chat.workspace.needs_reconfirmation,true);
  let restored=h.restore();chat=await restored.get(h.owner,{id:chat.id});
  const count=h.calls.length;
  for(const action of [{type:'select',card_id:CARD.card_id},{type:'compare',left_card_id:CARD.card_id,right_card_id:'other'},
    {type:'choose_comparison',card_id:CARD.card_id,side:'left'},{type:'reply',text:'006/165'},{type:'page',offset:1}])
    await assert.rejects(restored.action(h.owner,{id:chat.id,version:chat.version,action}),/catalog_rejected_action/);
  await assert.rejects(restored.beginCommerce(h.owner,{id:chat.id,version:chat.version,request_id:randomUUID(),operation:'research',request:{}}),/catalog_rejected_action/);
  assert.equal(h.calls.length,count);
  for(const text of ['status','explain','bare reply']){chat=await h.send(chat,text);assert.equal(chat.modelClarificationPending,true);assert.equal(h.calls.length,count);}
  restored=h.restore(false);chat=await restored.get(h.owner,{id:chat.id});
  chat=await restored.send(h.owner,{id:chat.id,version:chat.version,text:'006/165'});
  assert.equal(chat.modelClarificationPending,true);assert.equal(h.calls.length,count,'disabling the model does not bypass an existing clarification');
  chat=await restored.action(h.owner,{id:chat.id,version:chat.version,action:{type:'preferences',preferences:{budget_minor:30000,currency:'USD'}}});
  assert.equal(chat.modelClarificationPending,false);assert.equal(chat.workspace.result.preferences.budget_minor,30000);assert.equal(chat.target,null);
});

test('language holds remain stronger than model routing and clear only after accepted positive recovery',async()=>{
  const h=harness(async({text})=>route(text==='initial'?{type:'ask',question:'English Charizard cards'}:
    text==='negative'?{type:'language_clarification'}:text==='Japanese'?{type:'refine',scope:{language:'ja'}}:{type:'preferences',preferences:{budget_minor:30000,currency:'USD'}},text==='Japanese'?'ja':'en'));
  let chat=await h.service.create(h.owner,{});chat=await h.send(chat,'initial');chat=await h.send(chat,'negative');
  assert.equal(chat.languageClarificationPending,true);const count=h.calls.length;
  chat=await h.send(chat,'budget');assert.equal(chat.languageClarificationPending,true);assert.equal(h.calls.length,count);
  await assert.rejects(h.service.action(h.owner,{id:chat.id,version:chat.version,action:{type:'preferences',preferences:{budget_minor:30000,currency:'USD'}}}),/catalog_rejected_action/);
  await assert.rejects(h.service.beginCommerce(h.owner,{id:chat.id,version:chat.version,request_id:randomUUID(),operation:'research',request:{}}),/catalog_rejected_action/);
  chat=await h.send(chat,'Japanese');assert.equal(chat.languageClarificationPending,false);assert.equal(chat.workspace.result.scope_filters.language,'ja');
});

test('twenty-call budget persists across reopening; exhaustion calls neither model nor catalog',async()=>{
  let calls=0;const h=harness(async()=>{calls++;return route({type:'recommendation_status'},null);});
  let chat=await h.service.create(h.owner,{});
  for(let n=0;n<20;n++)chat=await h.send(chat,'status');
  assert.equal(calls,20);assert.equal(h.doc(chat.id).modelCalls,20);
  const restored=h.restore();chat=await restored.get(h.owner,{id:chat.id});
  chat=await restored.send(h.owner,{id:chat.id,version:chat.version,text:'status'});
  assert.equal(calls,20);assert.equal(h.calls.length,0);assert.equal(h.doc(chat.id).modelCalls,20);
  assert.match(chat.messages.at(-1).text,/model-turn limit/);assert.equal(chat.modelClarificationPending,true);
  assert.equal(h.doc(chat.id).modelLast.code,'model_budget_exhausted');assert.equal(h.doc(chat.id).pending,null);
});

test('model callback cannot return selection authority or leak errors through retained metadata',async()=>{
  const secret='sensitive-credential-not-for-retention';
  const h=harness(async()=>route({type:'select',card_id:CARD.card_id}));
  let chat=await h.service.create(h.owner,{});chat=await h.send(chat,'choose it');
  assert.equal(h.calls.length,0);assert.equal(chat.target,null);assert.equal(h.doc(chat.id).modelLast.code,'invalid_model_proposal');
  h.setInterpreter(async()=>({...route({type:'recommendation_status'}),modelMeta:{status:'accepted',code:'accepted',error:secret}}));
  chat=await h.send(chat,'status');assert.equal(h.doc(chat.id).modelLast.code,'invalid_model_proposal');
  h.setInterpreter(async()=>{throw Error(secret);});chat=await h.send(chat,'again');
  assert.equal(h.doc(chat.id).modelLast.code,'model_unavailable');assert.equal(JSON.stringify(chat).includes(secret),false);
  assert.equal(JSON.stringify(h.doc(chat.id)).includes(secret),false);assert.equal(h.calls.length,0);
});

test('cancellation discards a late model result and never executes its catalog action',async()=>{
  const entered=deferred(),late=deferred();let modelSignal;
  const h=harness(async(_input,{signal})=>{modelSignal=signal;entered.resolve();return late.promise;});
  let chat=await h.service.create(h.owner,{});const sending=h.send(chat,'Charizard 151/165');await entered.promise;
  const busy=await h.service.get(h.owner,{id:chat.id});assert.equal(busy.busy,true);assert.equal(busy.target,null);
  assert.deepEqual(await h.service.cancel(h.owner,{id:chat.id}),{cancellation_requested:true});
  await assert.rejects(sending,/catalog_cancelled/);assert.equal(modelSignal.aborted,true);
  late.resolve(route({type:'ask',question:'English Charizard 151/165'}));await new Promise(resolve=>setImmediate(resolve));
  chat=await h.service.get(h.owner,{id:chat.id});assert.equal(h.calls.length,0);assert.equal(chat.messages.at(-1).status,'failed');
  assert.equal(h.doc(chat.id).modelCalls,1);assert.equal(h.doc(chat.id).pending,null);assert.equal(h.doc(chat.id).modelPending,null);
});

test('a cancelled model turn cannot retain a prior commerce handoff anchor',async()=>{
  const entered=deferred(),late=deferred();
  const h=harness(async({text})=>text==='initial'?route({type:'ask',question:'English Charizard cards'}):(entered.resolve(),late.promise));
  let chat=await h.service.create(h.owner,{});chat=await h.send(chat,'initial');
  chat=await h.service.action(h.owner,{id:chat.id,version:chat.version,action:{type:'select',card_id:CARD.card_id}});
  h.mutate(chat.id,doc=>{doc.commerceAnchor={card_id:CARD.card_id,opaque:'must-not-survive'};});
  const sending=h.send(chat,'change my request');await entered.promise;
  assert.equal(h.doc(chat.id).commerceAnchor,null,'reservation withdraws the anchor before interpretation');
  await h.service.cancel(h.owner,{id:chat.id});await assert.rejects(sending,/catalog_cancelled/);
  late.resolve(route({type:'model_explanation',key:'current_results'}));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.doc(chat.id).commerceAnchor,null,'a late informational result cannot restore the anchor');
  chat=await h.service.get(h.owner,{id:chat.id});assert.equal(chat.target,null);
});

test('an expired overall deadline withdraws a pending model turn and discards late success',async()=>{
  const entered=deferred(),late=deferred();const h=harness(async()=>{entered.resolve();return late.promise;});
  let chat=await h.service.create(h.owner,{});const sending=h.send(chat,'Charizard cards',{deadline:Date.now()+40});await entered.promise;
  await assert.rejects(sending,/catalog_timeout/);late.resolve(route({type:'ask',question:'English Charizard cards'}));
  await new Promise(resolve=>setImmediate(resolve));chat=await h.service.get(h.owner,{id:chat.id});
  assert.equal(h.calls.length,0);assert.equal(chat.target,null);assert.equal(chat.messages.at(-1).status,'failed');assert.equal(h.doc(chat.id).pending,null);
});

test('model delay consumes the same overall deadline passed to a slow catalog phase',async()=>{
  let modelDeadline,catalogDeadline,catalogSignal;
  const h=harness(async({text},{deadline})=>{modelDeadline=deadline;await new Promise(resolve=>setTimeout(resolve,40));return route({type:'ask',question:'English '+text});});
  h.intercepts.start=async({signal,deadline})=>{
    catalogDeadline=deadline;catalogSignal=signal;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(resolve,800);
      const abort=()=>{clearTimeout(timer);reject(Object.assign(new Error('catalog_cancelled'),{code:'catalog_cancelled'}));};
      signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    });
  };
  let chat=await h.service.create(h.owner,{});const deadline=Date.now()+400;
  await assert.rejects(h.send(chat,'Charizard cards',{deadline}),/catalog_cancelled|catalog_timeout/);
  assert.equal(modelDeadline,deadline);assert.equal(catalogDeadline,deadline,'the catalog phase cannot reset the total budget after model work');
  assert.equal(catalogSignal.aborted,true);assert.equal(h.calls.length,1);assert.equal(h.doc(chat.id).pending,null);
  chat=await h.service.get(h.owner,{id:chat.id});assert.equal(chat.workspace,null);assert.equal(chat.target,null);
  assert.equal(chat.messages.at(-1).status,'failed');assert.equal(h.doc(chat.id).modelPending,null);
});

test('model-only timeout aborts its request and safely clarifies without dropping accepted preferences',async()=>{
  const entered=deferred(),late=deferred();let modelSignal;
  const h=harness(async({text},{signal})=>text==='initial'?route({type:'ask',question:'English Charizard cards'}):(modelSignal=signal,entered.resolve(),late.promise));
  let chat=await h.service.create(h.owner,{});chat=await h.send(chat,'initial');const count=h.calls.length;
  const started=Date.now(),sending=h.send(chat,'a model turn that never settles');await entered.promise;chat=await sending;
  assert.ok(Date.now()-started>=MAX_TIMEOUT_MS-50,'the shared transport cap controls the model-only deadline');
  assert.ok(Date.now()-started<MAX_TIMEOUT_MS+1000,'a model that ignores its signal cannot hold the turn indefinitely');
  assert.equal(modelSignal.aborted,true);assert.equal(h.calls.length,count);assert.deepEqual(chat.workspace.result.preferences,PREFS);
  assert.equal(chat.modelClarificationPending,true);assert.equal(h.doc(chat.id).modelLast.code,'gemini_timeout');
  assert.equal(chat.messages.at(-1).status,'accepted');assert.equal(chat.target,null);
  late.resolve(route({type:'ask',question:'English Pikachu cards'}));await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.calls.length,count);assert.equal(h.doc(chat.id).pending,null);
});

test('pre-aborted requests and another owner cannot consume model calls',async()=>{
  let calls=0;const h=harness(async()=>{calls++;return route({type:'recommendation_status'});});
  const chat=await h.service.create(h.owner,{}),controller=new AbortController();controller.abort();
  await assert.rejects(h.send(chat,'status',{signal:controller.signal}),/catalog_cancelled/);
  await assert.rejects(h.service.send({id:'other-owner'},{id:chat.id,version:chat.version,text:'status'}),/chat_not_found/);
  assert.equal(calls,0);assert.equal(h.doc(chat.id).modelCalls,undefined);assert.equal(h.doc(chat.id).version,0);
});

test('recovering a process-interrupted model reservation preserves spent budget without a replay',async()=>{
  let calls=0;const h=harness(async()=>{calls++;return route({type:'recommendation_status'});});
  let chat=await h.service.create(h.owner,{});
  h.mutate(chat.id,doc=>{doc.modelCalls=7;doc.pending=true;doc.commerceAnchor={opaque:'stale'};doc.modelPending={requestId:randomUUID(),stateVersion:0,workspaceVersion:null};});
  const reservation=structuredClone(h.doc(chat.id));
  await assert.rejects(h.restore().send(h.owner,{id:chat.id,version:chat.version,text:'retry before recovery'}),/logical_turn_in_progress/);
  assert.deepEqual(h.doc(chat.id),reservation,'a new service cannot spend another call or clear somebody else’s pending reservation');
  chat=await h.restore().get(h.owner,{id:chat.id});
  assert.equal(calls,0);assert.equal(h.doc(chat.id).modelCalls,7);assert.equal(h.doc(chat.id).modelPending,null);
  assert.equal(chat.messages.at(-1).status,'failed');assert.equal(chat.target,null);assert.equal(h.doc(chat.id).commerceAnchor,null);
});
