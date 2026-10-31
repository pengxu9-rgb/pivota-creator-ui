'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID,createHash}=require('node:crypto');
const {admit,validatePlan,nativeEcho}=require('../src/lib/pokemon/admission.cjs');
const {routeChatText}=require('../src/lib/pokemon/chatTextIntent.cjs');
const {createModelTurnRouter}=require('../src/lib/pokemon/modelTurn.cjs');
const {createConversationService}=require('../src/lib/pokemon/conversations.cjs');
const {rows,originals,intents,frames}=require('../reports/admission-kernel/evidence/corpus.cjs');
const copy=structuredClone,PREFS={currency:'USD',budget_minor:100000,grade_company:'PSA',grade_value:'10'};
const isHeld=plan=>!!plan.hold||['language_clarification','model_clarification'].includes(plan.action?.type);
function context(row){return {doc:{id:randomUUID(),version:7,languagePreference:row.priorLanguage,messages:[]},current:{id:randomUUID(),version:3,result:{goal_question:'Find Pikachu cards',scope_filters:{language:row.priorLanguage},preferences:copy(PREFS),catalog_revision:'a'.repeat(64),candidate_cards:[],discovery:{languages:[row.priorLanguage],task:'character_cards'}}}};}
function candidate(intent,row,current){
  const language=row.expectedLanguage||row.mentionedLanguage||'en';
  const action={search:{type:'ask',question:row.text},reply:{type:'reply',text:row.text},refine_language:{type:'refine',scope:{language}},preferences:{type:'preferences',preferences:{budget_minor:10000,currency:'USD'}},status:{type:'recommendation_status'},explain:{type:'model_explanation',key:'current_results'},clarify:{type:'model_clarification',field:'task',reason:'uncertain'},unsupported:{type:'model_explanation',key:'capability_scope'}}[intent];
  return {action,languagePreference:language,modelMeta:{status:'accepted',code:'accepted'}};
}
function checkPlan(plan,row,label){
  assert.ok(plan&&typeof plan==='object',label);
  assert.ok(Object.isFrozen(plan),'admitted plans are frozen: '+label);
  if(row.mustHold)assert.equal(isHeld(plan),true,'signal must be held rather than silently lost: '+label+' '+JSON.stringify(plan));
  if(row.mentionedLanguage&&isHeld(plan))assert.notEqual(plan.action.type,'refine','held language cannot change native scope: '+label);
  if(!isHeld(plan)&&row.kind==='identity'){
    assert.equal(plan.action.type,'ask','non-search model intent must not swallow identity: '+label);
    for(const token of row.text.match(/SV\d{2}(?:\.\d)?|\d{1,3}\/\d{1,3}|Charizard|Pikachu|Mewtwo|Lucario|Vaporeon/gi)||[])
      assert.ok(plan.action.question.includes(token),'identity token preserved: '+label+' '+token);
  }
  if(!isHeld(plan)&&row.kind==='commercial'){
    assert.equal(plan.action.type,'preferences','commercial text may only patch or hold: '+label);
    assert.notDeepEqual(plan.action.preferences,PREFS,'commercial change cannot preserve every old preference: '+label);
  }
}

test('generated corpus × 8 model proposals × model on/off × text/typed ask/typed reply preserves every oracle signal',async t=>{
  let cells=0;
  for(const row of rows)for(const intent of intents)for(const modelEnabled of [false,true])for(const ingress of ['text','typed_ask','typed_reply']){
    const {doc,current}=context(row),binding={owner:'b'.repeat(64),chatId:doc.id,stateVersion:doc.version,workspaceId:current.id,workspaceVersion:current.version,deadline:Date.now()+30000};
    const proposed=ingress.startsWith('typed_')?{action:ingress==='typed_ask'?{type:'ask',question:row.text}:{type:'reply',text:row.text},languagePreference:row.priorLanguage}:modelEnabled?candidate(intent,row,current):routeChatText(row.text,current,doc);
    const label=[row.id,intent,modelEnabled?'model_on':'model_off',ingress].join('/');
    const plan=admit({candidate:proposed,text:row.text,ingress:ingress==='text'?'text':'typed',binding,current,doc,now:Date.now});
    checkPlan(plan,row,label);validatePlan(plan,binding);cells++;
  }
  assert.equal(cells,rows.length*intents.length*2*3);assert.equal(attempts.length,0);
  t.diagnostic('matrix cells='+cells+'; corpus='+rows.length+'; distinct language frames='+frames.length+' per language');
});

function serviceHarness(row,intent,enabled){
  const {doc,current}=context(row),owner={id:'generated-owner'},ownerKey=createHash('sha256').update(owner.id).digest('hex');
  Object.assign(doc,{createdAt:Date.now(),updatedAt:Date.now(),expiresAt:Date.now()+3600000,title:'Prior request',workspaceId:current.id,pending:null,requiresReconfirmation:true});
  current.result.selection_allowed=false;current.needs_reconfirmation=true;current.saved_decision=null;
  const stored=new Map([[ownerKey+'/chats/'+doc.id,copy(doc)]]),calls=[];let modelCalls=0;
  const store={async get(o,k,id){return copy(stored.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,value){stored.set(o+'/'+k+'/'+id,copy(value));},async list(o,k){return [...stored].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>copy(v));},async delete(o,k,id){stored.delete(o+'/'+k+'/'+id);}};
  const workspace={
    async get(_context,id){assert.equal(id,current.id);return copy(current);},
    async start(){assert.fail('seeded current workspace must not restart');},
    async advance(_context,payload,options){
      calls.push(copy(payload.action));assert.equal(payload.version,current.version);
      const action=payload.action,next=copy(current);next.version++;
      if(action.type==='ask'){
        next.result.goal_question=action.question;
        const en=/English/i.test(action.question),ja=/Japanese/i.test(action.question),language=en&&!ja?'en':ja&&!en?'ja':row.priorLanguage;
        next.result.scope_filters={language};next.result.discovery.languages=[language];
      }
      if(action.type==='refine'){next.result.scope_filters={...next.result.scope_filters,...action.scope};if(action.scope.language)next.result.discovery.languages=[action.scope.language];}
      if(action.type==='preferences')next.result.preferences={...next.result.preferences,...action.preferences};
      if(options?.beforePublish)await options.beforePublish(next.result);
      Object.assign(current,next);return copy(current);
    },
    async save(){assert.fail('matrix must not grant selection');},
  };
  const interpretTurn=enabled?createModelTurnRouter({interpret:async input=>{
    modelCalls++;const spans=[];
    const language=row.text.match(/English|Japanese/);
    if(language&&['search','refine_language'].includes(intent))spans.push({field:'language',text:language[0]});
    if(intent==='preferences'&&row.text==='budget USD 100')spans.push({field:'budget',text:'100'},{field:'currency',text:'USD'});
    return {schema:'pokemon.interpret-turn.v1',state_version:input.state_version,intent,source_spans:spans,explanation_key:intent==='explain'?'current_results':'none',clarification_field:intent==='clarify'?'task':'none'};
  }}):undefined;
  const service=createConversationService({workspace,authenticate:async value=>value,store,interpretTurn});
  return {service,owner,doc,calls,modelCalls:()=>modelCalls,stored:()=>stored.get(ownerKey+'/chats/'+doc.id)};
}
test('all original review texts × 8 configured model intents × model on/off × actual send/typed ask/typed reply',async t=>{
  let cells=0;
  const originalRows=rows.filter(row=>originals.some(item=>item[0]===row.id)||['Japanese Charizard cards','Find Pikachu cards'].includes(row.text));
  for(const row of originalRows)for(const intent of intents)for(const enabled of [false,true])for(const ingress of ['text','typed_ask','typed_reply']){
    const h=serviceHarness(row,intent,enabled),label=[row.id,intent,enabled,ingress].join('/');
    const chat=ingress==='text'?await h.service.send(h.owner,{id:h.doc.id,version:h.doc.version,text:row.text}):await h.service.action(h.owner,{id:h.doc.id,version:h.doc.version,action:ingress==='typed_ask'?{type:'ask',question:row.text}:{type:'reply',text:row.text}});
    if(row.mustHold){assert.equal(h.calls.length,0,'unsafe input reached native workspace: '+label);assert.ok(chat.languageClarificationPending||chat.modelClarificationPending,'hold must survive in chat: '+label);assert.equal(chat.target,null);}
    else if(h.calls.length){assert.equal(h.calls[0].type,'ask','identity must search or hold: '+label);for(const token of row.text.match(/Charizard|Pikachu|SV03\.5|006\/165/g)||[])assert.ok(h.calls[0].question.includes(token),'identity lost '+token+': '+label);}
    else assert.ok(chat.languageClarificationPending||chat.modelClarificationPending,'non-search intent swallowed identity: '+label);
    assert.equal(h.modelCalls(),enabled&&ingress==='text'?1:0,'typed server ingress must not call a model: '+label);
    assert.equal(h.stored().modelCalls||0,enabled&&ingress==='text'?1:0,'typed ingress must not consume model budget: '+label);cells++;
  }
  assert.equal(cells,originalRows.length*8*2*3);assert.equal(attempts.length,0);t.diagnostic('service cross-product cells='+cells);
});

test('typed preferences share strict value and unknown-field admission (N5)',()=>{
  const row=rows[0],{doc,current}=context(row),binding={owner:'b'.repeat(64),chatId:doc.id,stateVersion:doc.version,workspaceId:current.id,workspaceVersion:current.version,deadline:Date.now()+30000};
  for(const preferences of [{budget_minor:-5,currency:'usd',grade_value:'10.5',note:'x'},{budget_minor:0,currency:'USD'},{budget_minor:100,currency:'usd'},{grade_company:'PSA',grade_value:'10.5'},{budget_minor:1e13,currency:'USD'},{currency:'ZZZ'},{note:'x'}]){
    let held=false;
    try{const plan=admit({candidate:{action:{type:'preferences',preferences}},text:'',ingress:'typed',binding,current,doc});held=isHeld(plan);}catch(error){held=/invalid|rejected|admission/.test(error.code||error.message);}
    assert.equal(held,true,'invalid typed preferences escaped admission '+JSON.stringify(preferences));
  }
});

test('ambiguous symbols never inherit any prior currency (N4)',()=>{
  for(const currency of ['USD','HKD','JPY','CNY','EUR','GBP','KRW'])for(const text of ['budget $100','budget ¥10000','budget ￥10000','budget USD $100','budget JPY ¥10000']){
    const row={priorLanguage:'ja'},ctx=context(row);ctx.current.result.preferences.currency=currency;
    const binding={owner:'b'.repeat(64),chatId:ctx.doc.id,stateVersion:7,workspaceId:ctx.current.id,workspaceVersion:3,deadline:Date.now()+30000};
    const plan=admit({...ctx,binding,candidate:{action:{type:'preferences',preferences:{budget_minor:10000,currency}}},text,ingress:'text'});
    assert.equal(isHeld(plan),true,text+' inherited '+currency);
    assert.equal(plan.hold.code,'ambiguous_currency','the clarification must identify the missing explicit currency unit');
  }
});

test('commerce hold is enforced by the admission constructor (F2)',()=>{
  for(const field of ['languageClarificationPending','modelClarificationPending']){
    const ctx=context({priorLanguage:'ja'});ctx.doc[field]=true;
    ctx.doc.messages=[{role:'assistant',status:'accepted',cards:[{card_id:'ja:SV2A:006/165:holo'}]}];
    ctx.current.result.candidate_cards=[{card_id:'ja:SV2A:006/165:holo'}];
    const binding={owner:'b'.repeat(64),chatId:ctx.doc.id,stateVersion:7,workspaceId:ctx.current.id,workspaceVersion:3,deadline:Date.now()+30000};
    let rejected=false;
    try{const plan=admit({...ctx,binding,candidate:{operation:'research',request:{card_id:'ja:SV2A:006/165:holo'}},text:'',ingress:'commerce'});rejected=isHeld(plan);}catch(error){rejected=/rejected|admission/.test(error.code||error.message);}
    assert.equal(rejected,true,'commerce bypassed '+field);
  }
});

test('admission itself retains language and task holds across model or router changes',()=>{
  for(const [flag,text,action,field] of [
    ['languageClarificationPending','budget USD 100',{type:'preferences',preferences:{budget_minor:10000,currency:'USD'}},'language'],
    ['modelClarificationPending','006/165',{type:'reply',text:'006/165'},'number'],
  ]){
    const ctx=context({priorLanguage:'ja'});ctx.doc[flag]=true;ctx.doc.modelClarificationField='number';
    const binding={owner:'b'.repeat(64),chatId:ctx.doc.id,stateVersion:7,workspaceId:ctx.current.id,workspaceVersion:3,deadline:Date.now()+30000};
    const plan=admit({...ctx,binding,candidate:{action},text,ingress:'text'});
    assert.equal(isHeld(plan),true,flag+' must survive in the constructor');assert.equal(plan.hold.field,field);
  }
});

test('commerce admission binds the request to the current admitted subject',()=>{
  const ctx=context({priorLanguage:'ja'}),card='ja:SV2A:006/165:holo',other='ja:SV2A:025/165:normal';
  ctx.doc.messages=[{role:'assistant',status:'accepted',cards:[{card_id:card},{card_id:other}]}];
  ctx.current.result.candidate_cards=[{card_id:card},{card_id:other}];
  ctx.current.saved_decision={card_id:card};
  const binding={owner:'b'.repeat(64),chatId:ctx.doc.id,stateVersion:7,workspaceId:ctx.current.id,workspaceVersion:3,deadline:Date.now()+30000};
  const accepted=admit({...ctx,binding,candidate:{operation:'research',request:{card_id:card}},ingress:'commerce'});assert.equal(accepted.kind,'commerce');
  for(const card_id of [other,'en:SV03.5:199/165:normal'])assert.throws(()=>admit({...ctx,binding,candidate:{operation:'research',request:{card_id}},ingress:'commerce'}),/catalog_rejected_action/);
});

test('native scope and preference echoes are checked independently for every admitted field',()=>{
  const ctx=context({priorLanguage:'en'}),binding={owner:'b'.repeat(64),chatId:ctx.doc.id,stateVersion:7,workspaceId:ctx.current.id,workspaceVersion:3,deadline:Date.now()+30000};
  const scope={language:'en',set_code:'SV03.5',collector_number:'006/165',variant:'holo'};
  const plan=admit({...ctx,binding,candidate:{action:{type:'refine',scope}},text:'',ingress:'typed'});
  const good={scope_filters:copy(scope),discovery:{languages:['en']},preferences:copy(PREFS),candidate_cards:[{card_id:'en:SV03.5:006/165:holo',...scope}],selection_allowed:true};
  assert.equal(nativeEcho(plan,good),true);
  for(const key of ['set_code','collector_number','variant']){
    const bad=copy(good);bad.scope_filters[key]='different';assert.throws(()=>nativeEcho(plan,bad),/catalog_admission_echo_mismatch/,'scope '+key);
    const missing=copy(good);delete missing.scope_filters[key];delete missing.candidate_cards[0][key];assert.throws(()=>nativeEcho(plan,missing),/catalog_admission_echo_mismatch/,'missing '+key);
  }
  for(const key of Object.keys(PREFS)){
    const bad=copy(good);bad.preferences[key]=key==='budget_minor'?1:'different';assert.throws(()=>nativeEcho(plan,bad),/catalog_admission_echo_mismatch/,'preference '+key);
    const missing=copy(good);delete missing.preferences[key];assert.throws(()=>nativeEcho(plan,missing),/catalog_admission_echo_mismatch/,'missing preference '+key);
  }
});

test('server-authored record review echo cannot publish any different record ID',()=>{
  const ctx=context({priorLanguage:'en'});ctx.current=null;ctx.doc.languagePreference=null;
  const binding={owner:'b'.repeat(64),chatId:ctx.doc.id,stateVersion:7,workspaceId:null,workspaceVersion:null,deadline:Date.now()+30000};
  const id='en:SV03.5:006/165:holo',plan=admit({...ctx,binding,candidate:{action:{type:'inspect_record',card_id:id}},ingress:'server'});
  const good={scope_filters:{},discovery:{languages:['en']},preferences:{},candidate_cards:[{card_id:id,language:'en',set_code:'SV03.5',collector_number:'006/165',variant:'holo'}],selection_allowed:true};
  assert.equal(nativeEcho(plan,good),true);
  const extra=copy(good);extra.candidate_cards.push({...extra.candidate_cards[0],card_id:'en:SV03.5:006/165:other'});
  assert.throws(()=>nativeEcho(plan,extra),/catalog_admission_echo_mismatch/);
});

test('substantive identity under status/explain gets a compound clarification that preserves the full request',()=>{
  for(const action of [{type:'recommendation_status'},{type:'model_explanation',key:'current_results'}]){
    const ctx=context({priorLanguage:'ja'}),binding={owner:'b'.repeat(64),chatId:ctx.doc.id,stateVersion:7,workspaceId:ctx.current.id,workspaceVersion:3,deadline:Date.now()+30000};
    const plan=admit({...ctx,binding,candidate:{action},text:'Find English Charizard SV03.5 006/165',ingress:'text'});
    assert.equal(plan.hold?.field,'compound','new identity must receive the full-request clarification rather than a generic task prompt');
  }
});
