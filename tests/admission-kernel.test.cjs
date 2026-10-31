'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {admit,nativeEcho}=require('../src/lib/pokemon/admission.cjs');
const {renderModelReply}=require('../src/lib/pokemon/modelTurn.cjs');
const {createConversationService}=require('../src/lib/pokemon/conversations.cjs');
const CARD={card_id:'en:SV03.5:006/165:holo',name:'Charizard ex',language:'en',set_code:'SV03.5',collector_number:'006/165',variant:'holo'};
const OTHER={...CARD,card_id:'en:SV03.5:151/165:holo',name:'Mew ex',collector_number:'151/165'};
function binding(current){return {owner:'b'.repeat(64),chatId:randomUUID(),stateVersion:1,workspaceId:current?.id??null,workspaceVersion:current?.version??null,deadline:Date.now()+30000};}
function harness(){
  const rows=new Map(),values=new Map(),calls=[],owner={id:'kernel-regression-owner'};let modelCalls=0;
  const store={async get(o,k,id){return structuredClone(rows.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){rows.set(o+'/'+k+'/'+id,structuredClone(v));},async list(o,k){return [...rows].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>structuredClone(v));},async delete(o,k,id){rows.delete(o+'/'+k+'/'+id);}};
  function result(question,preferences={}){
    const records=question.startsWith('Inspect catalog record ')?[CARD,OTHER].filter(c=>question.endsWith(c.card_id)):
      question.startsWith('Compare ')?[CARD,OTHER]:question.includes('151/165')?[]:[CARD,OTHER];
    return {goal_question:question,status:'candidate_clarification_needed',catalog_revision:'a'.repeat(64),scope_filters:{},preferences,
      discovery:{languages:['en'],task:'character_cards'},candidate_cards:structuredClone(records),selection_allowed:!!records.length,
      next_step:{field:'release',prompt:'Which release?'}};
  }
  const workspace={
    async start(_ctx,payload){calls.push(payload);const value={id:randomUUID(),version:1,result:result(payload.question),saved_decision:null,needs_reconfirmation:true};values.set(value.id,value);return structuredClone(value);},
    async advance(_ctx,payload){calls.push(payload.action);const value=values.get(payload.id);assert.equal(payload.version,value.version);value.version++;
      if(payload.action.type==='ask')value.result=result(payload.action.question,value.result.preferences);
      if(payload.action.type==='preferences')Object.assign(value.result.preferences,payload.action.preferences);
      return structuredClone(value);},
    async get(_ctx,id){return structuredClone(values.get(id));},
    async save(){assert.fail('these tests never choose a target');},
  };
  const make=()=>createConversationService({workspace,authenticate:async ctx=>ctx,store,interpretTurn:async()=>{modelCalls++;throw Error('server action must not call a model');}});
  return {owner,calls,service:make(),restore:make,modelCalls:()=>modelCalls,rows};
}

test('N6 reviewBookmark, reviewCard and compareBookmarks are typed server actions without model calls or budget',async()=>{
  const h=harness();let chat=await h.service.create(h.owner,{});
  chat=await h.service.action(h.owner,{id:chat.id,version:chat.version,action:{type:'ask',question:'English Charizard cards'}});
  const message=chat.messages.at(-1),left=await h.service.bookmarkAdd(h.owner,{conversation_id:chat.id,message_id:message.id,card_id:CARD.card_id});
  const right=await h.service.bookmarkAdd(h.owner,{conversation_id:chat.id,message_id:message.id,card_id:OTHER.card_id});
  const reviews=[await h.service.reviewBookmark(h.owner,{id:left.id}),await h.service.reviewCard(h.owner,{conversation_id:chat.id,message_id:message.id,card_id:CARD.card_id}),await h.service.compareBookmarks(h.owner,{left_id:left.id,right_id:right.id})];
  assert.equal(h.modelCalls(),0);assert.equal(h.calls.length,4);
  assert.equal(h.calls[1].question,'Inspect catalog record '+CARD.card_id);assert.equal(h.calls[2].question,'Inspect catalog record '+CARD.card_id);
  assert.equal(h.calls[3].question,'Compare '+CARD.card_id+' and '+OTHER.card_id);
  for(const review of reviews){assert.equal(review.modelClarificationPending,false);assert.ok(review.messages.at(-1).cards.length);const doc=[...h.rows.values()].find(v=>v.id===review.id);assert.equal(doc.modelCalls,undefined);assert.equal(doc.modelPending,undefined);}
  assert.equal(attempts.length,0);
});

test('typed English ask retains native single-language discovery through reopen when native scope_filters is empty',async()=>{
  const h=harness();let chat=await h.service.create(h.owner,{});
  chat=await h.service.action(h.owner,{id:chat.id,version:chat.version,action:{type:'ask',question:'English Charizard cards'}});
  assert.deepEqual(chat.workspace.result.scope_filters,{});
  const restored=h.restore();chat=await restored.get(h.owner,{id:chat.id});
  chat=await restored.action(h.owner,{id:chat.id,version:chat.version,action:{type:'ask',question:'Charizard 151/165'}});
  assert.equal(h.calls.at(-1).question,'English Charizard 151/165');assert.equal(h.modelCalls(),0);
  assert.equal([...h.rows.values()].find(v=>v.id===chat.id).languagePreference,'en');
});

test('native missing, malformed or conflicting language echoes cannot publish current results',()=>{
  const plan=admit({candidate:{action:{type:'ask',question:'English Charizard cards'}},text:'English Charizard cards',ingress:'typed',binding:binding()});
  for(const discovery of [undefined,{}, {languages:'en'},{languages:[]},{languages:['en','ja']}])
    assert.throws(()=>nativeEcho(plan,{scope_filters:{language:'en'},discovery,preferences:{},candidate_cards:[]}),/catalog_admission_echo_mismatch/);
  assert.throws(()=>nativeEcho(plan,{scope_filters:{},discovery:{languages:['en']},preferences:{},candidate_cards:[{...CARD,language:'ja'}]}),/catalog_admission_echo_mismatch/);
  assert.equal(nativeEcho(plan,{scope_filters:{},discovery:{languages:['en']},preferences:{},candidate_cards:[CARD]}),true);
});

test('single-token identities cannot become replies to an unrelated current request; coordinate replies need the matching prompt',()=>{
  const current={id:randomUUID(),version:2,result:{goal_question:'Find Pikachu cards',scope_filters:{language:'en'},discovery:{languages:['en']},preferences:{},candidate_cards:[],next_step:{field:'select'}}};
  for(const text of ['Charizard','Mewtwo','Lucario','Vaporeon','Alakazam','SV03.5','006/165']){
    const plan=admit({candidate:{action:{type:'reply',text}},text,ingress:'text',binding:binding(current),current});
    assert.ok(plan.hold||plan.action.type==='ask',text+' may not retain an old request as a completed answer');
  }
  current.result.next_step.field='number';
  const text='006/165',plan=admit({candidate:{action:{type:'reply',text}},text,ingress:'text',binding:binding(current),current});
  assert.equal(plan.action.type,'reply');assert.equal(plan.constraints.scope.collector_number,text);
});

test('ambiguous currency has an explicit ISO clarification contract for every saved currency',()=>{
  for(const currency of ['USD','HKD','JPY','CNY','EUR','GBP','KRW'])for(const text of ['budget $100','budget ¥10000','budget ￥10000']){
    const current={id:randomUUID(),version:2,result:{scope_filters:{language:'en'},discovery:{languages:['en']},preferences:{currency,budget_minor:100000}}};
    const plan=admit({candidate:{action:{type:'preferences',preferences:{currency,budget_minor:10000}}},text,ingress:'text',binding:binding(current),current});
    assert.equal(plan.hold.code,'ambiguous_currency');assert.equal(plan.action.code,'ambiguous_currency');
    assert.match(renderModelReply(plan.action,current),/explicit ISO currency code/);assert.equal(plan.constraints.preferences.budget_minor,100000);
  }
});

test('multiple release or fraction signals are held as a whole rather than omitted from native constraints',()=>{
  for(const text of ['Find Charizard SV03.5 and SWSH12','Find Charizard from set BASE1 and BASE2','Find Charizard 006/165 and 199/165','Charizard SV03.5 SWSH12']){
    const plan=admit({candidate:{action:{type:'ask',question:text}},text,ingress:'typed',binding:binding()});assert.equal(plan.hold?.field,'compound',text);
  }
});

test('compact currency and grade words are detected independently of the proposed intent',()=>{
  for(const text of ['Find Charizard USD100','Find Charizard PSA10','Find Charizard grade9'])for(const action of [{type:'ask',question:text},{type:'recommendation_status'},{type:'model_explanation',key:'current_results'}]){
    const plan=admit({candidate:{action},text,ingress:'text',binding:binding()});assert.equal(plan.hold?.field,'compound',text);
  }
});

test('detected unsupported languages and money units hold instead of silently inheriting accepted scope',()=>{
  const current={id:randomUUID(),version:2,result:{scope_filters:{language:'ja'},discovery:{languages:['ja']},preferences:{currency:'USD',budget_minor:100000,grade_company:'PSA',grade_value:'10'}}};
  for(const language of ['Korean','French','German','Chinese','Spanish','Thai','한국어','中文']){
    const text='Find '+language+' Charizard cards',plan=admit({candidate:{action:{type:'ask',question:text}},text,ingress:'typed',binding:binding(current),current});
    assert.equal(plan.hold?.field,'language',text);assert.equal(plan.languagePreference,'ja');
  }
  for(const text of ['Find Charizard cards for 100 yuan','Find Charizard cards CHF 100','Find Charizard cards ₹100','Find Charizard cards CAD100','Find Charizard cards at most 100','Find Charizard cards 100 limit','Find Charizard cards around 100']){
    const plan=admit({candidate:{action:{type:'ask',question:text}},text,ingress:'typed',binding:binding(current),current});assert.equal(plan.hold?.field,'compound',text);
  }
});

test('unknown single words cannot be swallowed by status or explanation proposals',()=>{
  for(const text of ['Lucario','Vaporeon','Alakazam'])for(const action of [{type:'recommendation_status'},{type:'model_explanation',key:'current_results'},{type:'model_explanation',key:'capability_scope'}]){
    const plan=admit({candidate:{action},text,ingress:'text',binding:binding()});assert.ok(plan.hold,text+' cannot be a positive local-control request');
  }
});

test('positive-language grammar accepts requests, while language-first prose and questions are held',()=>{
  for(const text of ['English is not wanted for Charizard','English is just an example for Charizard','Japanese should be excluded from Charizard cards','Do you mean Charizard cards in English?']){
    const plan=admit({candidate:{action:{type:'ask',question:text}},text,ingress:'typed',binding:binding()});assert.equal(plan.hold?.field,'language',text);
  }
  for(const text of ['English Charizard cards','Find English Charizard SV03.5 006/165','Charizard cards in English']){
    const plan=admit({candidate:{action:{type:'ask',question:text}},text,ingress:'typed',binding:binding()});assert.equal(plan.hold,null,text);assert.equal(plan.constraints.language,'en');
  }
});
