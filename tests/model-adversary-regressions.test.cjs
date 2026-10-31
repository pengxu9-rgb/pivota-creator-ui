'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createModelTurnRouter}=require('../src/lib/pokemon/modelTurn.cjs');
const {createConversationService}=require('../src/lib/pokemon/conversations.cjs');

function proposal(input,intent,evidence={}){
  return {schema:'pokemon.interpret-turn.v1',state_version:input.state_version,intent,
    source_spans:Object.entries(evidence).map(([field,text])=>({field,text})),
    explanation_key:'none',clarification_field:'none'};
}
async function interpret(text,intent,evidence={},currency='USD'){
  const router=createModelTurnRouter({interpret:async input=>proposal(input,intent,evidence)});
  return router({text,doc:{version:4,languagePreference:'ja',messages:[]},
    current:{version:2,result:{scope_filters:{language:'ja'},preferences:{currency,budget_minor:100000}}}});
}
function clarification(result){
  assert.ok(['model_clarification','language_clarification'].includes(result.action.type),JSON.stringify(result));
  assert.equal(Object.hasOwn(result.action,'preferences'),false);
  assert.equal(Object.hasOwn(result.action,'question'),false);
}

test('a currency symbol cannot silently inherit a different saved unit',async()=>{
  for(const [text,currency] of [['budget €100','USD'],['budget £100','USD'],['budget ¥100','USD'],
    ['budget ￥100','HKD'],['budget $100','JPY'],['budget €100','GBP']])
    clarification(await interpret(text,'preferences',{budget:'100'},currency));
  clarification(await interpret('budget €USD 100','preferences',{budget:'100',currency:'USD'},'EUR'));
});

test('compatible symbols retain the accepted currency and its minor-unit precision',async()=>{
  for(const [text,currency,amount,minor] of [['budget €19.95','EUR','19.95',1995],
    ['budget £10.50','GBP','10.50',1050],['budget ¥1000','JPY','1000',1000],
    ['budget ￥12.50','CNY','12.50',1250],['budget $120.50','HKD','120.50',12050]]){
    const result=await interpret(text,'preferences',{budget:amount},currency);
    assert.deepEqual(result.action,{type:'preferences',preferences:{budget_minor:minor,currency}});
  }
});

test('search cannot bypass quoted or metalinguistic language checks by omitting evidence',async()=>{
  for(const [text,language] of [['Show Charizard cards; "English" is just an example','English'],
    ["Find Charizard cards; what does 'English' mean?",'English'],
    ['Find Charizard cards; English is a word','English'],
    ['Show Charizard cards; 「英文」只是例子','英文']]){
    clarification(await interpret(text,'search'));
    clarification(await interpret(text,'search',{language}));
  }
});

test('positive search language needs current-turn evidence, and then preserves the complete raw query',async()=>{
  const text='English Charizard SV03.5 006/165';
  clarification(await interpret(text,'search'));
  const result=await interpret(text,'search',{language:'English'});
  assert.deepEqual(result.action,{type:'ask',question:text});
  assert.equal(result.languagePreference,'en');
  clarification(await interpret('Find Charizard cards without English','search'));
});

test('raw search never sends an excluded language token to a parser that treats both languages as positive',async()=>{
  for(const [text,language] of [['Find Japanese Charizard cards, not English','Japanese'],
    ['Find English Charizard cards, not Japanese','English'],
    ['不要英文，用日文找喷火龙卡','日文'],['英語ではなく日本語のカードを探す','日本語']])
    clarification(await interpret(text,'search',{language}));
  assert.deepEqual((await interpret('not English, Japanese please','refine_language',{language:'Japanese'})).action,
    {type:'refine',scope:{language:'ja'}},'the typed refinement can bind a grounded positive replacement safely');
});

test('real model router plus conversation service apply neither mismatched money nor quoted language',async()=>{
  const rows=new Map(),workspaces=new Map(),catalogCalls=[],owner={id:'adversary-only-owner'};
  const copy=structuredClone,prefs={grade_company:'PSA',grade_value:'10',currency:'USD',budget_minor:100000};
  const store={
    async get(user,kind,id){return copy(rows.get(user+'/'+kind+'/'+id)||null);},
    async put(user,kind,id,value){rows.set(user+'/'+kind+'/'+id,copy(value));},
    async list(user,kind){return [...rows].filter(([key])=>key.startsWith(user+'/'+kind+'/')).map(([,value])=>copy(value));},
    async delete(user,kind,id){rows.delete(user+'/'+kind+'/'+id);},
  };
  const workspace={
    async start(_context,payload){
      catalogCalls.push(copy(payload));
      const value={id:randomUUID(),version:1,needs_reconfirmation:true,saved_decision:null,
        result:{goal_question:payload.question,scope_filters:{language:'ja'},preferences:copy(prefs),
          catalog_revision:'a'.repeat(64),candidate_cards:[],selection_allowed:false,discovery:{task:'character_cards',languages:['ja']}}};
      workspaces.set(value.id,value);return copy(value);
    },
    async get(_context,id){return copy(workspaces.get(id));},
    async advance(){assert.fail('rejected model semantics must not reach the catalog');},
  };
  const interpretTurn=createModelTurnRouter({interpret:async input=>input.text==='Japanese Charizard cards'
    ?proposal(input,'search',{language:'Japanese'})
    :input.text==='budget €100'?proposal(input,'preferences',{budget:'100'}):proposal(input,'search')});
  const service=createConversationService({workspace,store,authenticate:async context=>context,interpretTurn});
  let chat=await service.create(owner,{});
  chat=await service.send(owner,{id:chat.id,version:chat.version,text:'Japanese Charizard cards'});
  assert.equal(catalogCalls.length,1);
  chat=await service.send(owner,{id:chat.id,version:chat.version,text:'budget €100'});
  assert.equal(catalogCalls.length,1);assert.deepEqual(chat.workspace.result.preferences,prefs);
  assert.equal(chat.modelClarificationPending,true);assert.equal(chat.target,null);
  chat=await service.send(owner,{id:chat.id,version:chat.version,text:'Show Charizard cards; "English" is just an example'});
  assert.equal(catalogCalls.length,1);assert.equal(chat.languageClarificationPending,true);
  assert.deepEqual(chat.workspace.result.preferences,prefs);assert.deepEqual(chat.workspace.result.scope_filters,{language:'ja'});
  assert.equal(chat.target,null);
  const reopened=await service.get(owner,{id:chat.id});
  assert.equal(reopened.languageClarificationPending,true);assert.equal(catalogCalls.length,1);
});
