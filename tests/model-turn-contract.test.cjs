'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {RESPONSE_SCHEMA,SYSTEM_INSTRUCTION,buildModelInput,validateModelProposal,projectModelAction,renderModelReply,createModelTurnRouter}=require('../src/lib/pokemon/modelTurn.cjs');
const REV='b'.repeat(64),CARD='en:SV03.5:006/165:holo';
function context(text,options={}){
  return {text,doc:{version:7,languagePreference:'en',languageClarificationPending:false,messages:[],...options.doc},
    current:options.current===null?null:{version:3,result:{catalog_revision:REV,status:'candidate_clarification_needed',goal_question:'English Charizard cards',
      scope_filters:{language:'en'},preferences:{grade_company:'PSA',grade_value:'10',budget_minor:100000,currency:'USD'},
      candidate_cards:[{card_id:CARD,name:'Charizard ex',language:'en',set_code:'SV03.5',collector_number:'006/165'}],
      next_step:{prompt:'Which printed release do you mean?'},discovery:{task:'character_cards'},...options.result}}};
}
function proposal(intent,changes={}){return {schema:'pokemon.interpret-turn.v1',state_version:7,intent,source_spans:[],explanation_key:'none',clarification_field:'none',...changes};}
function spans(values){return Object.entries(values).map(([field,text])=>({field,text}));}
async function route(c,p){let calls=0;const router=createModelTurnRouter({interpret:async(input,options)=>{calls++;assert.equal(input.state_version,c.doc.version);assert.equal(Object.hasOwn(options,'signal'),true);return p;}});const value=await router(c);assert.equal(calls,1);return value;}
const local=value=>{assert.ok(['language_clarification','model_clarification'].includes(value.action.type),JSON.stringify(value));assert.equal(Object.hasOwn(value.action,'question'),false);assert.equal(Object.hasOwn(value.action,'preferences'),false);};
const invalid=()=>error=>{assert.equal(error.code,'invalid_model_proposal');return true;};

test('schema declares the exact proposal surface and never exposes executable or authoritative fields',()=>{
  assert.equal(RESPONSE_SCHEMA.type,'OBJECT');assert.deepEqual([...RESPONSE_SCHEMA.required].sort(),['schema','state_version','intent','source_spans','explanation_key','clarification_field'].sort());
  assert.deepEqual(Object.keys(RESPONSE_SCHEMA.properties).sort(),[...RESPONSE_SCHEMA.required].sort());
  assert.deepEqual(RESPONSE_SCHEMA.properties.intent.enum,['search','reply','refine_language','preferences','status','explain','clarify','unsupported']);
  assert.equal(RESPONSE_SCHEMA.properties.source_spans.maxItems,5);assert.match(SYSTEM_INSTRUCTION,/untrusted data/i);assert.match(SYSTEM_INSTRUCTION,/No target selection/i);
});

const positiveLanguages=[
  ['English','English','en'],['english, no preference on others','english','en'],['English please','English','en'],
  ['Use Japanese','Japanese','ja'],['Japanese only','Japanese','ja'],['英文','英文','en'],['英語でお願いします','英語','en'],
  ['英版就好','英版','en'],['日文就可以','日文','ja'],['日本語のカード','日本語','ja'],['日版','日版','ja'],
  ['not Japanese, English please','English','en'],['不要英文，用日文','日文','ja'],['英語ではなく日本語','日本語','ja'],
];
for(const [text,span,expected] of positiveLanguages)test('explicit positive language: '+text,async()=>{
  const c=context(text),before=structuredClone(c),value=await route(c,proposal('refine_language',{source_spans:spans({language:span})}));
  assert.deepEqual(value.action,{type:'refine',scope:{language:expected}});assert.equal(value.languagePreference,expected);assert.deepEqual(c,before);
});
const languageNotChoices=[
  ['not English','English'],['avoid Japanese','Japanese'],['without English','English'],['English is not wanted','English'],
  ["I don't want English",'English'],['I do not want Japanese','Japanese'],['不要英文','英文'],['不是日文','日文'],['不想日本語','日本語'],
  ['别用英文','英文'],['不要使用日文','日文'],['英語ではなく','英語'],['日本語以外','日本語'],['英語は使わない','英語'],
  ["What does 'English' mean?",'English'],['What does "Japanese" mean?','Japanese'],['For example, “英文” is a word','英文'],
  ['「日本語」という意味は？','日本語'],['English or Japanese','English'],['either English or Japanese','Japanese'],['English and Japanese','English'],
];
for(const [text,span] of languageNotChoices)test('quoted, negated or ambiguous language cannot become a positive choice: '+text,async()=>{
  const value=await route(context(text),proposal('refine_language',{source_spans:spans({language:span})}));local(value);
});
test('source-span evidence must be unique and from this exact current turn',()=>{
  const c=context('English, and English again'),input=buildModelInput(c);
  const value=validateModelProposal(proposal('refine_language',{source_spans:spans({language:'English'})}),input);
  assert.throws(()=>projectModelAction(value,c),invalid());
  assert.throws(()=>validateModelProposal(proposal('refine_language',{source_spans:spans({language:'Japanese'})}),input),invalid());
});
test('pending negative-language hold blocks an inherited search and only an explicit positive choice resolves the route',async()=>{
  const pending={doc:{languageClarificationPending:true}};
  local(await route(context('Charizard 151/165',pending),proposal('search')));
  local(await route(context('What does "English" mean?',pending),proposal('refine_language',{source_spans:spans({language:'English'})})));
  const value=await route(context('Japanese',pending),proposal('refine_language',{source_spans:spans({language:'Japanese'})}));
  assert.deepEqual(value.action,{type:'refine',scope:{language:'ja'}});
});

const rawSearches=[
  ['Charizard 151/165',null,'English Charizard 151/165'],['English Charizard 151/165','English','English Charizard 151/165'],
  ['Japanese Charizard 151/165','Japanese','Japanese Charizard 151/165'],['Charizard SV03.5 006/165',null,'English Charizard SV03.5 006/165'],
  ['Find Pikachu 173/165',null,'English Find Pikachu 173/165'],['Compare Charizard 006/165 and 199/165',null,'English Compare Charizard 006/165 and 199/165'],
  ['ピカチュウ 173/165',null,'English ピカチュウ 173/165'],['喷火龙 006/165',null,'English 喷火龙 006/165'],
  ['English Charizard cards from set SV03.5','English','English Charizard cards from set SV03.5'],
  ['Japanese ミュウex 151/165','Japanese','Japanese ミュウex 151/165'],
  ['Inspect catalog record en:SV03.5:006/165:holo',null,'English Inspect catalog record en:SV03.5:006/165:holo'],
  ['Find an illustrator I can explore',null,'English Find an illustrator I can explore'],
];
for(const [text,language,expected] of rawSearches)test('search preserves every raw name and coordinate: '+text,async()=>{
  const c=context(text),value=await route(c,proposal('search',{source_spans:language?spans({language}):[]}));
  assert.deepEqual(value.action,{type:'ask',question:expected});assert.equal(value.action.question.includes(text),true);assert.equal(value.modelMeta.status,'accepted');
});
test('latest accepted language outranks an old memo and no current scope leaves the raw question intact',async()=>{
  const value=await route(context('Charizard 006/165',{result:{scope_filters:{language:'ja'}}}),proposal('search'));
  assert.equal(value.action.question,'Japanese Charizard 006/165');
  const initial=await route(context('Charizard 006/165',{current:null,doc:{languagePreference:null}}),proposal('search'));
  assert.equal(initial.action.question,'Charizard 006/165');
});

const budgets=[
  ['budget USD 1,234.56',{budget:'1,234.56',currency:'USD'},{budget_minor:123456,currency:'USD'}],
  ['under 500',{budget:'500'},{budget_minor:50000,currency:'USD'}],
  ['budget JPY 1000',{budget:'1000',currency:'JPY'},{budget_minor:1000,currency:'JPY'}],
  ['below KRW 20000',{budget:'20000',currency:'KRW'},{budget_minor:20000,currency:'KRW'}],
  ['budget EUR 19.95',{budget:'19.95',currency:'EUR'},{budget_minor:1995,currency:'EUR'}],
  ['maximum GBP 10.5',{budget:'10.5',currency:'GBP'},{budget_minor:1050,currency:'GBP'}],
  ['预算 CNY 999.50',{budget:'999.50',currency:'CNY'},{budget_minor:99950,currency:'CNY'}],
  ['預算 HKD 12.01',{budget:'12.01',currency:'HKD'},{budget_minor:1201,currency:'HKD'}],
];
for(const [text,evidence,expected] of budgets)test('budget patch is parsed deterministically from exact source spans: '+text,async()=>{
  const value=await route(context(text),proposal('preferences',{source_spans:spans(evidence)}));
  assert.deepEqual(value.action,{type:'preferences',preferences:expected});
});
test('currency-only changes need a new amount when a saved budget exists, and work when no budget exists',async()=>{
  const value=proposal('preferences',{source_spans:spans({currency:'EUR'})});
  local(await route(context('Use EUR'),value));
  const withoutBudget=context('Use EUR',{result:{preferences:{grade_company:'PSA',grade_value:'10',currency:'USD'}}});
  assert.deepEqual((await route(withoutBudget,value)).action,{type:'preferences',preferences:{currency:'EUR'}});
});
const grades=[['PSA10','PSA','10'],['BGS 9.5','BGS','9.5'],['CGC8','CGC','8'],['ARS 10','ARS','10'],['psa 9','psa','9']];
for(const [text,company,grade] of grades)test('grade patch uses the asserted adjacent company and value: '+text,async()=>{
  const value=await route(context(text),proposal('preferences',{source_spans:spans({grade_company:company,grade_value:grade})}));
  assert.deepEqual(value.action,{type:'preferences',preferences:{grade_company:company.toUpperCase(),grade_value:grade}});
});
const invalidPreferences=[
  ['budget USD 0',{budget:'0',currency:'USD'}],['under -20 USD',{budget:'20',currency:'USD'}],
  ['budget USD 10.999',{budget:'10.999',currency:'USD'}],['budget JPY 10.50',{budget:'10.50',currency:'JPY'}],
  ['budget USD 10000000000',{budget:'10000000000',currency:'USD'}],['budget USD 1e3',{budget:'1',currency:'USD'}],
  ['PSA 0',{grade_company:'PSA',grade_value:'0'}],['PSA 11',{grade_company:'PSA',grade_value:'11'}],['BGS 10.5',{grade_company:'BGS',grade_value:'10.5'}],
  ['PSA and 10 cards',{grade_company:'PSA',grade_value:'10'}],['not PSA10',{grade_company:'PSA',grade_value:'10'}],
  ['budget AUD 100',{budget:'100',currency:'AUD'}],['budget card 151/165',{budget:'151'}],['budget 100',{budget:'200'}],
  ['budget USD 1,000',{budget:'1',currency:'USD'}],['budget USD 1,000',{budget:'000',currency:'USD'}],
  ['budget USD 10.50',{budget:'10',currency:'USD'}],['budget USD 151/165',{budget:'165',currency:'USD'}],
  ['budget USDT 100',{budget:'100',currency:'USD'}],['budget XUSD 100',{budget:'100',currency:'USD'}],
  ['PSA10.5',{grade_company:'PSA',grade_value:'10'}],['PSA10',{grade_company:'PSA',grade_value:'1'}],
  ['PSA9 and BGS10',{grade_company:'PSA',grade_value:'10'}],['PSA9 and BGS10',{grade_company:'PSA',grade_value:'9'}],
  ['PSA10 and budget USD100',{budget:'10',currency:'USD'}],['USD100, budget JPY200',{budget:'100',currency:'USD'}],
];
for(const [text,evidence] of invalidPreferences)test('invalid preference assertion causes clarification without a partial patch: '+text,async()=>{
  const value=await route(context(text),proposal('preferences',{source_spans:spans(evidence)}));local(value);
});
const compoundCases=[
  ['Find Charizard under USD 100','search',{}],['Find Charizard under USD 100','preferences',{budget:'100',currency:'USD'}],
  ['English, budget USD 100','refine_language',{language:'English'}],['Japanese PSA10','refine_language',{language:'Japanese'}],
  ['English Charizard budget USD 100','search',{language:'English',budget:'100',currency:'USD'}],
  ['Find Charizard PSA10','search',{}],['Find Charizard PSA10','preferences',{grade_company:'PSA',grade_value:'10'}],
];
for(const [text,intent,evidence] of compoundCases)test('compound search or language and preference update requires an explicit clarification: '+intent+' / '+text,async()=>{
  const value=await route(context(text),proposal(intent,{source_spans:spans(evidence)}));local(value);
});

for(const key of ['current_results','identity_ambiguity','grade_budget_unverified','prices_unavailable','provider_disabled','capability_scope'])test('explanation is a bounded local template with no new commercial authority: '+key,async()=>{
  const c=context('Explain this research'),before=structuredClone(c),value=await route(c,proposal('explain',{explanation_key:key}));
  assert.deepEqual(value.action,{type:'model_explanation',key});assert.equal(Object.hasOwn(value.action,'question'),false);
  const text=renderModelReply(value.action,c.current);assert.equal(typeof text,'string');assert.ok(text.length>20);assert.doesNotMatch(text,/https?:\/\/|\$[\d,]+/);assert.deepEqual(c,before);
});
test('status and unsupported requests cannot select, place an order or invent response text',async()=>{
  const c=context('Have you recommended the cards?');assert.deepEqual((await route(c,proposal('status'))).action,{type:'recommendation_status'});
  const unsupported=await route(context('Place an order and pay now'),proposal('unsupported'));
  assert.deepEqual(unsupported.action,{type:'model_explanation',key:'capability_scope'});assert.match(renderModelReply(unsupported.action,c.current),/unavailable/);
});
test('schema, state version, nested evidence and intent-dependent fields are validated before routing',()=>{
  const input=buildModelInput(context('English'));
  const bad=[proposal('status',{schema:'v0'}),proposal('status',{state_version:6}),proposal('status',{state_version:'7'}),proposal('status',{state_version:Number.MAX_SAFE_INTEGER+1}),
    proposal('checkout'),proposal('status',{source_spans:spans({language:'English'})}),proposal('explain'),proposal('status',{explanation_key:'current_results'}),
    proposal('clarify'),proposal('status',{clarification_field:'task'}),proposal('refine_language',{source_spans:[{field:'language',text:'English',owner:'other'}]}),
    proposal('refine_language',{source_spans:[{field:'language',text:'English'},{field:'language',text:'English'}]}),
    proposal('refine_language',{source_spans:[{field:'token',text:'English'}]})];
  for(const value of bad)assert.throws(()=>validateModelProposal(value,input),invalid());
  assert.deepEqual(validateModelProposal(proposal('status'),input),proposal('status'));
});
test('malformed root values and excessive or nonliteral evidence are rejected by the real validator',()=>{
  const input=buildModelInput(context('English '+'x'.repeat(81))),evidence=spans({language:'English'});
  const bad=[null,[],true,'JSON text',{},proposal('refine_language',{source_spans:null}),
    proposal('refine_language',{source_spans:[...evidence,...evidence,...evidence,...evidence,...evidence,...evidence]}),
    proposal('refine_language',{source_spans:[{field:'language',text:'x'.repeat(81)}]}),
    proposal('refine_language',{source_spans:[{field:'language',text:' '}]}),
    proposal('refine_language',{source_spans:[{field:'language',text:'english'}]})];
  for(const value of bad)assert.throws(()=>validateModelProposal(value,input),invalid());
});
for(const key of ['owner','tenant_id','app_id','access_token','tool_calls','order','payment','query','card_id','price_minor','answer'])test('model-injected field is rejected, never granted authority: '+key,async()=>{
  const value=await route(context('English'),{...proposal('status'),[key]:'untrusted-model-value'});local(value);assert.equal(value.modelMeta.status,'invalid');
});
for(const text of ['yes','151/165','holo','SV03.5'])test('narrow reply remains tied to the current catalog prompt: '+text,async()=>{
  assert.deepEqual((await route(context(text),proposal('reply'))).action,{type:'reply',text});
});
test('an injected reply classification cannot force a fresh coordinate question through the old narrow reply grammar',async()=>{
  const value=await route(context('Charizard 151/165'),proposal('reply'));assert.equal(value.action.type,'ask');assert.equal(value.action.question,'English Charizard 151/165');
});
for(const failure of ['gemini_timeout','invalid_model_proposal','gemini_unavailable','gemini_access_denied','arbitrary_provider_error'])test('interpreter failure returns only explicit recovery, never a catalog action: '+failure,async()=>{
  const router=createModelTurnRouter({interpret:async()=>{throw Object.assign(Error('private details'),{code:failure});}});
  const value=await router(context('Charizard 151/165'));local(value);assert.equal(value.action.type,'model_clarification');assert.equal(value.action.reason,'model_unavailable');
  assert.doesNotMatch(JSON.stringify(value),/private details/);assert.equal(value.modelMeta.code,failure==='gemini_timeout'?'gemini_timeout':failure==='invalid_model_proposal'?'invalid_model_proposal':'model_unavailable');
});
test('a canceled interpreter does not fall back or create a recoverable semantic turn',async()=>{
  const router=createModelTurnRouter({interpret:async()=>{throw Object.assign(Error('cancelled'),{code:'gemini_cancelled'});}});
  await assert.rejects(router(context('Charizard 151/165')),error=>error.code==='catalog_cancelled');
});
test('caller cancellation before and during interpretation is never converted into a fallback action',async()=>{
  let calls=0;const controller=new AbortController();controller.abort();
  const before=createModelTurnRouter({interpret:async()=>{calls++;return proposal('status');}});
  await assert.rejects(before(context('status'),{signal:controller.signal}),error=>error.code==='catalog_cancelled');assert.equal(calls,0);
  const during=new AbortController(),router=createModelTurnRouter({interpret:async()=>{during.abort();return proposal('status');}});
  await assert.rejects(router(context('status'),{signal:during.signal}),error=>error.code==='catalog_cancelled');
});
test('canonical context projection bounds history/cards and omits tenant identities, receipts, URLs and credentials',()=>{
  const secret='opaqueSecretTokenValue'.repeat(4),url='https://private.example/receipt?token=hidden',email='customer@example.com';
  const c=context('Compare cards '+url+' '+email+' '+secret,{doc:{owner:'owner-server-id',tenant_id:'tenant-secret',app_id:'app-secret',receipt:{token:secret,url},messages:[
    {id:'assistant-only',role:'assistant',text:secret,commerce:{receipt:url}},...Array.from({length:7},(_,i)=>({id:'turn-'+i,role:'user',text:'Turn '+i+' '+url+' '+email+' '+secret}))]},
    result:{goal_question:'Goal '+url+' '+email+' '+secret,candidate_cards:Array.from({length:8},(_,i)=>({card_id:'card-'+i,name:'Card '+i+' '+email,language:'en',set_code:'SV03.5',collector_number:'006/165',token:secret,url,receipt:{url}})),
      offers:[{url,token:secret}],receipt:{url},preferences:{grade_company:'PSA',grade_value:'10',budget_minor:100000,currency:'USD',token:secret}}});
  const before=structuredClone(c),input=buildModelInput(c),raw=JSON.stringify(input);assert.deepEqual(c,before);
  for(const hidden of [secret,url,email,'owner-server-id','tenant-secret','app-secret','assistant-only','receipt?token=hidden'])assert.equal(raw.includes(hidden),false,hidden);
  assert.equal(input.recent_user_turns.length,4);assert.equal(input.accepted.candidates.length,5);assert.equal(input.state_version,7);assert.equal(input.accepted.workspace_version,3);
  assert.deepEqual(input.accepted.preferences,{grade_company:'PSA',grade_value:'10',budget_minor:100000,currency:'USD'});
  assert.equal(input.accepted.catalog_revision,REV);assert.equal(input.accepted.language,'en');assert.match(raw,/\[email omitted\]/);assert.match(raw,/\[link omitted\]/);
});
