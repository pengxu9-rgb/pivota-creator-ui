'use strict';
// Model spend caps beyond the per-chat budget, and deterministic routing when the
// model is unavailable. Every model call here is an in-process mock.
const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {createConversationService,createConversationFileStore}=require('../src/lib/pokemon/conversations.cjs');
const {createModelTurnRouter}=require('../src/lib/pokemon/modelTurn.cjs');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');

const CARD={card_id:'en:SV03.5:006/165:holo',name:'Charizard ex',language:'en',set_code:'SV03.5',collector_number:'006/165',variant:'holo'};
const USAGE_ID='00000000-0000-4000-8000-000000000000';
const DAY=86400000,HOUR=3600000;
const accepted=(action,languagePreference=null)=>({action,languagePreference,modelMeta:{status:'accepted',code:'accepted'}});
const ownerKey=id=>createHash('sha256').update(id).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

function memoryStore(){
  const rows=new Map();
  return {rows,
    async get(user,kind,id){return structuredClone(rows.get(user+'/'+kind+'/'+id)??null);},
    async put(user,kind,id,value){rows.set(user+'/'+kind+'/'+id,structuredClone(value));},
    async list(user,kind){return [...rows].filter(([key])=>key.startsWith(user+'/'+kind+'/')).map(([,value])=>structuredClone(value));},
    async delete(user,kind,id){rows.delete(user+'/'+kind+'/'+id);},
  };
}
function fakeWorkspace(){
  const values=new Map(),calls=[];
  // Mirrors the native echo contract: the result states the language it applied.
  const result=question=>{
    const language=/\bJapanese\b/i.test(question)?'ja':'en',fraction=question.match(/\d{1,3}\/[A-Za-z0-9-]+/)?.[0];
    const cards=fraction&&fraction!==CARD.collector_number?[]:[{...structuredClone(CARD),language,card_id:CARD.card_id.replace(/^en:/,language+':')}];
    return {status:'candidate_clarification_needed',catalog_revision:'a'.repeat(64),goal_question:question,
      preferences:{},scope_filters:{language},discovery:{languages:[language]},candidate_cards:cards,selection_allowed:cards.length>0,
      selected_catalog_target:null,next_step:{field:'number',prompt:'Which printed collector number?'},prices:[],live_offers:[]};
  };
  return {calls,
    async start(context,payload){calls.push({method:'start',payload:structuredClone(payload)});
      const value={id:randomUUID(),version:1,result:result(payload.question),saved_decision:null,needs_reconfirmation:true,transaction_ready:false};
      values.set(value.id,value);return structuredClone(value);},
    async advance(context,payload){const {id,version,...rest}=payload;calls.push({method:'advance',payload:structuredClone(rest)});
      const value=values.get(id);value.version++;
      if(payload.action.type==='ask')value.result=result(payload.action.question);
      if(payload.action.type==='refine'){
        value.result.scope_filters={...value.result.scope_filters,...payload.action.scope};
        const language=payload.action.scope.language;
        if(language){value.result.discovery.languages=[language];value.result.candidate_cards=value.result.candidate_cards.map(c=>({...c,language,card_id:c.card_id.replace(/^(?:en|ja):/,language+':')}));}
      }
      if(payload.action.type==='preferences')value.result.preferences={...value.result.preferences,...payload.action.preferences};
      return structuredClone(value);},
    async get(context,id){return structuredClone(values.get(id));},
    async save(context,payload){calls.push({method:'save'});const value=values.get(payload.id);value.saved_decision={card_id:CARD.card_id};return structuredClone(value);},
    async delete(context,id){values.delete(id);},
  };
}
function harness({interpret,limits,clock,store=memoryStore(),enabled=true}={}){
  const workspace=fakeWorkspace(),fallbacks=[];let calls=0;
  const make=()=>createConversationService({workspace,store,authenticate:async context=>context?.id?{id:context.id}:null,
    ...(clock?{modelNow:()=>clock.t}:{}),...(limits?{modelLimits:limits}:{}),onModelFallback:event=>fallbacks.push(structuredClone(event)),
    ...(enabled?{interpretTurn:async(input,options)=>{calls++;return (interpret||(async()=>accepted({type:'recommendation_status'})))(input,options);}}:{})});
  const service=make();
  return {service,make,store,workspace,fallbacks,calls:()=>calls,
    doc:(owner,id)=>store.rows.get(ownerKey(owner.id)+'/chats/'+id),
    usage:owner=>store.rows.get(ownerKey(owner.id)+'/model_usage/'+USAGE_ID),
    async send(owner,chat,text,s=service){return s.send(owner,{id:chat.id,version:chat.version,text});}};
}

test('the per-identity daily cap survives deleting and recreating chats',async()=>{
  const owner={id:'identity-a'},h=harness({limits:{perIdentityDaily:3}});
  let chat=await h.service.create(owner,{});
  chat=await h.send(owner,chat,'status');chat=await h.send(owner,chat,'status');
  assert.equal(h.calls(),2);assert.equal(h.usage(owner).calls,2);
  await h.service.delete(owner,{id:chat.id});
  assert.equal(h.usage(owner).calls,2,'deleting a chat never resets the identity counter');
  chat=await h.service.create(owner,{});chat=await h.send(owner,chat,'status');
  assert.equal(h.calls(),3);assert.equal(h.doc(owner,chat.id).modelCalls,1);
  chat=await h.send(owner,chat,'status');
  assert.equal(h.calls(),3,'a refused turn never reaches the model');assert.equal(h.usage(owner).calls,3);
  assert.equal(h.doc(owner,chat.id).modelCalls,1,'a refused turn does not spend the chat budget');
  assert.equal(h.doc(owner,chat.id).modelLast.code,'model_identity_budget_exhausted');
  assert.equal(h.doc(owner,chat.id).modelLast.status,'fallback');assert.equal(h.doc(owner,chat.id).modelPending,null);
  assert.equal(chat.messages.at(-1).status,'accepted');assert.equal(h.doc(owner,chat.id).pending,null);
  assert.deepEqual(h.fallbacks,[{code:'model_identity_budget_exhausted',outcome:'deterministic_router'}]);
  // A brand-new service instance (another process) reads the same durable counter.
  const other=h.make();let fresh=await other.create(owner,{});fresh=await h.send(owner,fresh,'status',other);
  assert.equal(h.calls(),3);assert.equal(h.doc(owner,fresh.id).modelLast.code,'model_identity_budget_exhausted');
});

test('the per-identity counter is durable before the model is contacted and resets on the next UTC day',async()=>{
  const owner={id:'identity-b'},clock={t:Date.UTC(2026,10,13,23,59)};
  const h=harness({clock,limits:{perIdentityDaily:1},interpret:async()=>{
    assert.equal(h.usage(owner).calls,1,'the reservation is persisted before interpretation');
    return accepted({type:'recommendation_status'});}});
  let chat=await h.service.create(owner,{});chat=await h.send(owner,chat,'status');
  chat=await h.send(owner,chat,'status');assert.equal(h.calls(),1);
  clock.t+=2*60000;chat=await h.send(owner,chat,'status');
  assert.equal(h.calls(),2,'a new UTC day restores the identity allowance');
  assert.deepEqual(h.usage(owner),{id:USAGE_ID,day:Math.floor(clock.t/DAY),calls:1,expiresAt:(Math.floor(clock.t/DAY)+2)*DAY});
});

test('identities are counted separately while the per-instance hourly ceiling is shared',async()=>{
  const a={id:'identity-c'},b={id:'identity-d'},clock={t:Date.UTC(2026,10,13,10,0)};
  const h=harness({clock,limits:{perIdentityDaily:5,perInstanceHourly:2}});
  let chatA=await h.service.create(a,{}),chatB=await h.service.create(b,{});
  chatA=await h.send(a,chatA,'status');chatA=await h.send(a,chatA,'status');
  chatB=await h.send(b,chatB,'status');
  assert.equal(h.calls(),2);assert.equal(h.doc(b,chatB.id).modelLast.code,'model_instance_budget_exhausted');
  assert.equal(h.usage(b),undefined,'an instance refusal spends no identity allowance');
  assert.equal(chatB.messages.at(-1).status,'accepted');
  clock.t+=HOUR;chatB=await h.send(b,chatB,'status');
  assert.equal(h.calls(),3,'the next hour opens a new instance window');assert.equal(h.usage(b).calls,1);
});

test('the instance ceiling is reserved synchronously across concurrent identities',async()=>{
  const gate=deferred(),entered=deferred();let inFlight=0;
  const h=harness({limits:{perInstanceHourly:1},interpret:async()=>{inFlight++;entered.resolve();await gate.promise;return accepted({type:'recommendation_status'});}});
  const owners=[{id:'identity-e'},{id:'identity-f'},{id:'identity-g'}];
  const chats=await Promise.all(owners.map(o=>h.service.create(o,{})));
  const turns=owners.map((o,i)=>h.send(o,chats[i],'status'));
  await entered.promise;await new Promise(resolve=>setImmediate(resolve));gate.resolve();
  const results=await Promise.all(turns);
  assert.equal(inFlight,1);assert.equal(h.calls(),1);
  assert.equal(results.filter((_,i)=>h.doc(owners[i],results[i].id).modelLast.code==='model_instance_budget_exhausted').length,2);
  for(const r of results)assert.equal(r.messages.at(-1).status,'accepted');
});

test('an unreadable identity counter refuses the model and routes deterministically',async()=>{
  const owner={id:'identity-h'},h=harness();
  h.store.rows.set(ownerKey(owner.id)+'/model_usage/'+USAGE_ID,{id:USAGE_ID,day:'today',calls:-1});
  let chat=await h.service.create(owner,{});chat=await h.send(owner,chat,'status');
  assert.equal(h.calls(),0);assert.equal(h.doc(owner,chat.id).modelLast.code,'model_identity_budget_exhausted');
  assert.equal(chat.messages.at(-1).status,'accepted');
});

test('model limit configuration is validated',()=>{
  const base={workspace:fakeWorkspace(),store:memoryStore(),authenticate:async()=>null};
  for(const modelLimits of [{perIdentityDaily:-1},{perInstanceHourly:1.5},{perUserDaily:3},[],'many'])
    assert.throws(()=>createConversationService({...base,modelLimits}),/invalid_model_configuration/);
  assert.throws(()=>createConversationService({...base,onModelFallback:'stderr'}),/invalid_model_configuration/);
  assert.throws(()=>createConversationService({...base,modelNow:0}),/invalid_model_configuration/);
  assert.doesNotThrow(()=>createConversationService({...base,modelLimits:{perIdentityDaily:0}}));
});

test('the file store keeps the identity counter outside the chats directory',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'model-usage-'));
  try{
    const owner={id:'identity-i'},h=harness({store:createConversationFileStore({directory}),limits:{perIdentityDaily:1}});
    let chat=await h.service.create(owner,{});chat=await h.send(owner,chat,'status');
    await h.service.delete(owner,{id:chat.id});
    chat=await h.service.create(owner,{});chat=await h.send(owner,chat,'status');
    assert.equal(h.calls(),1);
    const record=JSON.parse(await fs.readFile(path.join(directory,ownerKey(owner.id),'model_usage',USAGE_ID+'.json'),'utf8'));
    assert.equal(record.calls,1);
  }finally{await fs.rm(directory,{recursive:true,force:true});}
});

// Outage differential: each failure must produce the turn the model-off router produces.
const SEQUENCE=['English Charizard cards','006/165','Japanese','what are my recommendations','budget under 300 USD','status','a turn the router reads as a reply'];
async function transcript(h,owner){
  let chat=await h.service.create(owner,{});const out=[];
  for(const text of SEQUENCE){
    chat=await h.send(owner,chat,text);const m=chat.messages.at(-1);
    out.push({text:m.text,status:m.status,cards:(m.cards||[]).map(c=>c.card_id),target:chat.target,
      language:chat.languageClarificationPending,clarify:chat.modelClarificationPending});
  }
  return {out,catalog:h.workspace.calls};
}
const OUTAGES={
  thrown_unavailable:async()=>{throw Object.assign(new Error('gemini_unavailable'),{code:'gemini_unavailable'});},
  thrown_access_denied:async()=>{throw Object.assign(new Error('gemini_access_denied'),{code:'gemini_access_denied'});},
  thrown_timeout:async()=>{throw Object.assign(new Error('gemini_timeout'),{code:'gemini_timeout'});},
  router_unavailable:createModelTurnRouter({interpret:async()=>{throw Object.assign(new Error('gemini_rate_limited'),{code:'gemini_rate_limited'});}}),
  router_timeout:createModelTurnRouter({interpret:async()=>{throw Object.assign(new Error('gemini_timeout'),{code:'gemini_timeout'});}}),
};
for(const [name,interpret] of Object.entries(OUTAGES))test('a model outage routes every free-text turn as the model-off router does: '+name,async()=>{
  const owner={id:'identity-diff'};
  const off=await transcript(harness({enabled:false}),owner);
  const down=harness({interpret}),result=await transcript(down,owner);
  assert.deepEqual(result.out,off.out);assert.deepEqual(result.catalog,off.catalog);
  assert.ok(off.catalog.length>=2,'the reference sequence reaches the catalog');
  assert.equal(down.calls(),SEQUENCE.length,'each turn attempts the model once, without retries');
  const code=name.endsWith('timeout')?'gemini_timeout':'model_unavailable';
  assert.deepEqual(down.fallbacks,SEQUENCE.map(()=>({code,outcome:'deterministic_router'})));
  assert.equal(JSON.stringify(down.fallbacks).includes('Charizard'),false,'the fallback log never carries user text');
  assert.equal(result.out.some(t=>/could not confidently interpret/.test(t.text))===off.out.some(t=>/could not confidently interpret/.test(t.text)),true);
});

test('only an inadmissible model proposal keeps the could-not-interpret clarification',async()=>{
  const owner={id:'identity-j'};
  const h=harness({interpret:createModelTurnRouter({interpret:async input=>({schema:'pokemon.interpret-turn.v1',state_version:input.state_version+7,
    intent:'search',source_spans:[],explanation_key:'none',clarification_field:'none'})})});
  // A text without card or preference signals, so the kernel keeps the model's task clarification.
  let chat=await h.service.create(owner,{});chat=await h.send(owner,chat,'hmm, not sure yet');
  assert.match(chat.messages.at(-1).text,/could not confidently interpret/);
  assert.equal(h.doc(owner,chat.id).modelLast.code,'invalid_model_proposal');assert.equal(h.workspace.calls.length,0);
  assert.deepEqual(h.fallbacks,[]);
});

test('a cancelled turn is not converted into a deterministic fallback',async()=>{
  const owner={id:'identity-k'},entered=deferred();
  const h=harness({interpret:async(_input,{signal})=>{entered.resolve();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(new Error('gemini_cancelled'),{code:'gemini_cancelled'})),{once:true}));}});
  const chat=await h.service.create(owner,{});const sending=h.send(owner,chat,'English Charizard cards');await entered.promise;
  await h.service.cancel(owner,{id:chat.id});await assert.rejects(sending,/catalog_cancelled/);
  assert.equal(h.workspace.calls.length,0);assert.deepEqual(h.fallbacks,[]);
});

test('the durable object store accepts the identity counter and keeps it across chat deletion',async()=>{
  const {createDurableState}=require('../src/lib/pokemon/googleState.cjs');
  // In-memory stand-in for the object backend: generation-matched writes and removes, no network.
  const objects=new Map();let generation=0;
  const conflict=()=>{throw Object.assign(new Error('state_version_conflict'),{code:'state_version_conflict'});};
  const backend={
    async read(key){const o=objects.get(key);return o?{generation:o.generation,value:structuredClone(o.value)}:null;},
    async write(key,value,expected){const o=objects.get(key);if((o?o.generation:'0')!==expected)conflict();const g=String(++generation);objects.set(key,{generation:g,value:structuredClone(value)});return g;},
    async remove(key,expected){const o=objects.get(key);if(!o||o.generation!==expected)conflict();objects.delete(key);},
    async list(prefix){return [...objects.keys()].filter(k=>k.startsWith(prefix)).sort();},
  };
  const durable=createDurableState({config:{namespace:'model-usage-test',expiresAt:Date.now()+DAY},backend});
  const session=await durable.createSession(Date.now()+30000),context={demoSession:session};
  let calls=0;
  const chats=durable.wrap(createConversationService({workspace:fakeWorkspace(),store:durable.conversationStore,
    authenticate:async ctx=>({id:'owner-local-demo:'+ctx.demoSession}),modelLimits:{perIdentityDaily:2},onModelFallback:()=>{},
    interpretTurn:async()=>{calls++;return accepted({type:'recommendation_status'});}}));
  let chat=await chats.create(context,{});chat=await chats.send(context,{id:chat.id,version:chat.version,text:'status'});
  chat=await chats.send(context,{id:chat.id,version:chat.version,text:'status'});
  await chats.delete(context,{id:chat.id});
  chat=await chats.create(context,{});chat=await chats.send(context,{id:chat.id,version:chat.version,text:'status'});
  assert.equal(calls,2,'the counter outlives the deleted chat in durable state');
  assert.equal(chat.messages.at(-1).status,'accepted');
  const key='model-usage-test/owners/'+durable.ownerFor(session)+'/model_usage/'+USAGE_ID+'.json';
  assert.equal(objects.get(key).value.calls,2);
});
