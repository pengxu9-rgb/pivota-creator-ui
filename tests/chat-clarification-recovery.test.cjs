'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {routeChatText}=require('../src/lib/pokemon/chatTextIntent.cjs');
const {createCollectorClient}=require('../src/lib/pokemon/vendor/collectorClient.cjs');
const {createPrivateCollectorWorkspace,createMemoryStore}=require('../src/lib/pokemon/vendor/privateCollector.cjs');
const {createConversationService}=require('../src/lib/pokemon/conversations.cjs');

const REV='a'.repeat(64);
const PREFERENCES={grade_company:'PSA',grade_value:'10',budget_minor:100000,currency:'USD'};
const CLARIFY='Which printed set code or release name accompanies that number?';
const current=()=>({result:{status:'followup_clarification_needed',preferences:{...PREFERENCES},candidate_cards:[],next_step:{field:'language',prompt:'Which language should I search?'}}});

// These are injected catalog replies, not fabricated market/copy evidence.
// The real connector, persisted private workspace and conversation service are
// used together so assertions cover actual turn routing and accepted UI text.
function nativeReply(turns,prompt='Which language should I search?'){
  let language=null;
  for(const turn of turns){
    if(turn.type==='ask')language=/\bEnglish\b/i.test(turn.question)?'en':/\bJapanese\b/i.test(turn.question)?'ja':null;
    if(turn.type==='refine'&&turn.scope.language)language=turn.scope.language;
  }
  return {
    schema:'pokemon.collector-journey.v1',status:'followup_clarification_needed',
    catalog_revision:REV,turn_count:turns.length,trace:turns.map(()=>({})),
    candidate_cards:[],artwork_review_leads:[],selection_blockers:[],
    card_selection_blockers:{},selection_allowed:false,recommendation:null,target_intent:null,
    preferences:{...PREFERENCES},scope_filters:language?{language}:{},discovery:{languages:language?[language]:['ja','en']},
    next_step:{field:'release',prompt},prices:[],live_offers:[],
    conversation_persisted:false,inventory_persisted:false,ownership_assertions_verified:false,
    physical_copy_verified:false,ready_for_offer_tracking:false,purchase_ready:false,
    complete_collection_established:false,public_display_allowed:false,preferences_applied_to_market:false,
  };
}
function harness(respond){
  const requests=[],rows=new Map(),context={id:'offline-clarification-owner'};
  const client=createCollectorClient({baseUrl:'https://offline.example',getIdToken:async()=>'offline-token',maxAttempts:1,
    fetchImpl:async(url,options)=>{
      assert.equal(new URL(url).pathname,'/collector-journey');
      const request=JSON.parse(options.body);requests.push(structuredClone(request));
      const result=await respond(request,requests.length);
      return new Response(JSON.stringify(result.body??result),{status:result.httpStatus??200,headers:{'content-type':'application/json'}});
    }});
  const authenticate=async c=>({id:c.id}),workspaceStore=createMemoryStore();
  const store={
    async get(owner,kind,id){return structuredClone(rows.get(owner+'/'+kind+'/'+id)||null);},
    async put(owner,kind,id,value){rows.set(owner+'/'+kind+'/'+id,structuredClone(value));},
    async list(owner,kind){return [...rows.entries()].filter(([key])=>key.startsWith(owner+'/'+kind+'/')).map(([,value])=>structuredClone(value));},
    async delete(owner,kind,id){rows.delete(owner+'/'+kind+'/'+id);},
  };
  const make=()=>createConversationService({workspace:createPrivateCollectorWorkspace({client,store:workspaceStore,authenticate}),authenticate,store});
  const service=make();
  return {requests,context,service,restore:make,send:(chat,text)=>service.send(context,{id:chat.id,version:chat.version,text})};
}

test('a substantive first question remains an ask when workspace result is unavailable',()=>{
  for(const workspace of [null,{result:null,next_step:{field:'restart_and_reconfirm'}}]){
    const routed=routeChatText('Charizard 151/165',workspace);
    assert.equal(routed.action.type,'ask');
    assert.equal(routed.action.question,'Charizard 151/165');
  }
});

test('compound English answer is a language refinement, not negative collecting taste',()=>{
  const routed=routeChatText('english, no preference on others',current());
  assert.deepEqual(routed.action,{type:'refine',scope:{language:'en'}});
  assert.equal(routed.languagePreference,'en');
  assert.equal(JSON.stringify(routed.action).includes('excluded_dex_ids'),false);
});

test('specific follow-up retains English and the exact supplied coordinate',()=>{
  const routed=routeChatText('Charizard 151/165',current(),{languagePreference:'en'});
  assert.equal(routed.action.type,'ask');
  assert.match(routed.action.question,/English/i);
  assert.match(routed.action.question,/Charizard 151\/165/);
  assert.doesNotMatch(routed.action.question,/006\/165|183\/165|199\/165/,'never silently substitute a different printing');
  assert.equal(routed.languagePreference,'en');
});

test('explicit Japanese scope overrides retained English without contradictory prefixing',()=>{
  const routed=routeChatText('Japanese Charizard 151/165',current(),{languagePreference:'en'});
  assert.equal(routed.action.type,'ask');
  assert.equal(routed.languagePreference,'ja');
  assert.match(routed.action.question,/Japanese Charizard 151\/165/i);
  assert.doesNotMatch(routed.action.question,/English/i);
});

test('short confirmation, coordinate and finish answers remain replies',()=>{
  for(const text of ['yes','151/165','holo']){
    const routed=routeChatText(text,current(),{languagePreference:'en'});
    assert.deepEqual(routed.action,{type:'reply',text});
    assert.equal(routed.languagePreference,'en');
  }
});

test('recommendation status question is handled locally rather than replayed as a new collection goal',()=>{
  const routed=routeChatText('have you recommended the cards/',current(),{languagePreference:'en'});
  assert.equal(routed.action.type,'recommendation_status');
  assert.equal(routed.languagePreference,'en');
});

test('the exact screenshot sequence keeps language, does not replay status, and asks a specific release question',async()=>{
  const h=harness((request,index)=>nativeReply(request.turns,index===1?'Which language should I search?':CLARIFY));
  let chat=await h.service.create(h.context,{});
  chat=await h.send(chat,'Find a valuable card');
  chat=await h.send(chat,'english, no preference on others');
  assert.deepEqual(h.requests[1].turns.at(-1),{type:'refine',scope:{language:'en'}});
  const resumed=h.restore();
  chat=await resumed.get(h.context,{id:chat.id});
  assert.equal(h.requests.length,2,'reopening must retain routing context without another catalog call');
  const beforeStatus=h.requests.length;
  chat=await resumed.send(h.context,{id:chat.id,version:chat.version,text:'have you recommended the cards/'});
  assert.equal(h.requests.length,beforeStatus,'status question must not invoke catalog, providers or automatic search');
  assert.equal(chat.messages.at(-1).cards.length,0,'status answer must not invent recommendations');
  assert.doesNotMatch(chat.messages.at(-1).text,/Tell me what you would like to explore next/);
  chat=await resumed.send(h.context,{id:chat.id,version:chat.version,text:'Charizard 151/165'});
  assert.equal(h.requests.length,3);
  const action=h.requests.at(-1).turns.at(-1);
  assert.equal(action.type,'ask');
  assert.match(action.question,/English/i);
  assert.match(action.question,/Charizard 151\/165/);
  assert.equal(chat.messages.at(-1).text,CLARIFY);
  assert.equal(chat.target,null);
  assert.equal(chat.workspace.transaction_ready,false);
  assert.deepEqual(chat.workspace.result.preferences,PREFERENCES);
  assert.deepEqual(chat.workspace.result.prices,[]);
  assert.deepEqual(chat.workspace.result.live_offers,[]);
  assert.equal(chat.messages.filter(m=>m.role==='user').at(-1).text,'Charizard 151/165','displayed user text stays verbatim');
});

test('catalog-change result exposes the workspace restart instruction without automatic replay or target authority',async()=>{
  const h=harness((request,index)=>index===1?nativeReply(request.turns):{
    httpStatus:400,body:{error:'catalog or journey policy changed; replay without the old revision and reconfirm the target'},
  });
  let chat=await h.service.create(h.context,{});
  chat=await h.send(chat,'Find a valuable card');
  chat=await h.send(chat,'english, no preference on others');
  assert.equal(h.requests.length,2,'revision failure must not automatically replay the user turn');
  assert.equal(h.requests[1].expected_revision,REV);
  assert.equal(chat.workspace.result,null);
  assert.equal(chat.workspace.saved_decision,null);
  assert.equal(chat.workspace.needs_reconfirmation,true);
  assert.equal(chat.target,null);
  assert.equal(chat.requiresRestart,true);
  assert.match(chat.messages.at(-1).text,/catalog changed/i);
  assert.match(chat.messages.at(-1).text,/reconfirm/i);
  assert.doesNotMatch(chat.messages.at(-1).text,/Tell me what you would like to explore next/);
  const restored=await h.restore().get(h.context,{id:chat.id});
  assert.equal(h.requests.length,2,'restoring the history must not retry catalog work');
  assert.equal(restored.messages.at(-1).text,chat.messages.at(-1).text);
  assert.equal(restored.target,null);
  assert.equal(restored.workspace.result,null);
});

test('unresolved language survives reopen and blocks both another inherited query and direct target selection',async()=>{
  const h=harness(request=>nativeReply(request.turns));
  let chat=await h.service.create(h.context,{});
  chat=await h.send(chat,'English Charizard cards');
  chat=await h.send(chat,'not English');
  assert.equal(chat.languageClarificationPending,true);
  assert.equal(h.requests.length,1);
  const resumed=h.restore();
  chat=await resumed.get(h.context,{id:chat.id});
  chat=await resumed.send(h.context,{id:chat.id,version:chat.version,text:'Charizard 151/165'});
  assert.equal(chat.languageClarificationPending,true);
  assert.equal(h.requests.length,1,'unresolved correction cannot execute another English query');
  await assert.rejects(resumed.action(h.context,{id:chat.id,version:chat.version,action:{type:'select',card_id:'en:SV03.5:006/165:holo'}}),/catalog_rejected_action/);
  assert.equal(h.requests.length,1);
  chat=await resumed.send(h.context,{id:chat.id,version:chat.version,text:'Japanese'});
  assert.equal(chat.languageClarificationPending,false);
  assert.deepEqual(h.requests.at(-1).turns.at(-1),{type:'refine',scope:{language:'ja'}});
  chat=await resumed.send(h.context,{id:chat.id,version:chat.version,text:'Charizard 151/165'});
  assert.equal(h.requests.at(-1).turns.at(-1).question,'Japanese Charizard 151/165');
  assert.equal(chat.target,null);
});
