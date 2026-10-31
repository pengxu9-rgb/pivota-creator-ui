'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
const {admit,storedGoalsAccepted,extractSignals}=require('../src/lib/pokemon/admission.cjs');
const {createConversationService}=require('../src/lib/pokemon/conversations.cjs');
const {createPrivateCollectorWorkspace}=require('../src/lib/pokemon/vendor/privateCollector.cjs');
const fullwidth=text=>[...text].map(c=>/[!-~]/.test(c)?String.fromCharCode(c.charCodeAt(0)+0xfee0):c).join('');
const ask=question=>({type:'ask',question}),reply=text=>({type:'reply',text});
const SAFE='Find Charizard cards',CARD='en:BASE1:006/102:normal';
function current(goal=SAFE,language=null,turns=[ask(goal)]){
  return {id:randomUUID(),version:2,result:{goal_question:goal,scope_filters:language?{language}:{},discovery:{languages:language?[language]:['ja','en']},
    preferences:{},candidate_cards:[{card_id:CARD,name:'Charizard',language:'en',set_code:'BASE1',collector_number:'006/102',variant:'normal'}],next_step:{field:'variant'}},session:{turns}};
}
function plan(action,cur,doc={}){
  return admit({candidate:{action},ingress:'typed',text:action.question||action.text||'',current:cur,doc,
    binding:{owner:'round5-owner',chatId:'round5-chat',stateVersion:1,workspaceId:cur?.id??null,workspaceVersion:cur?.version??null,deadline:Date.now()+30000}});
}
const releaseCases=[
  ['Find Charizard cards from Base Set','ja'],
  ['Find Pikachu cards from ホロンの幻影','en'],
  ['English Find Charizard cards from Base Set','ja'],
  ['Japanese Find Pikachu cards from ホロンの幻影','en'],
  ['Find English Charizard cards from Base Set','ja'],
  ['Find Japanese Pikachu cards from ホロンの幻影','en'],
  ['English Find Lucario cards','ja'],
];
test('R5-1: every stored ask uses its own positive language or no language, never the later workspace language',t=>{
  let cells=0;
  for(const [question,laterLanguage] of releaseCases)for(const text of [question,fullwidth(question)])for(const placement of ['latest_goal','older_ask']){
    const cur=placement==='latest_goal'?current(text,laterLanguage):current(SAFE,laterLanguage,[ask(text),ask(SAFE)]);
    const before=structuredClone(cur);
    assert.equal(storedGoalsAccepted(cur),true,JSON.stringify({question:text,laterLanguage,placement}));
    for(const action of [{type:'page',offset:0},{type:'select',card_id:CARD}]){
      const p=plan(action,cur);assert.equal(p.hold,null,JSON.stringify({text,laterLanguage,placement,action}));
      const expectedSubject=placement==='older_ask'?'Charizard':question.includes('Pikachu')?'Pikachu':question.includes('Lucario')?'Lucario':'Charizard';
      assert.equal(p.constraints.identity?.subject,expectedSubject,'language switch must retain the stored goal identity');
    }
    assert.deepEqual(cur,before,'language validation is read-only');cells++;
  }
  assert.equal(cells,28);assert.equal(attempts.length,0);t.diagnostic('28 stored-goal/history cells; page and select remain executable');
});

test('R5-1: admitted ask-time language positions remain valid after forwarding and a later language switch',()=>{
  for(const text of ['Find Charizard cards from Base Set','Find Pikachu cards from ホロンの幻影',
    'Find English Charizard cards from Base Set','Find Japanese Pikachu cards from ホロンの幻影',
    'Find Charizard cards in English','Find Pikachu cards in Japanese']){
    const original=plan(ask(text),null);assert.equal(original.hold,null,text+' must be a valid ask-time control');
    const later=original.constraints.language==='ja'?'en':'ja';
    const cur=current(original.action.question,later,[ask(original.action.question)]);
    assert.equal(storedGoalsAccepted(cur),true,text+' -> '+original.action.question);
    assert.equal(plan({type:'page',offset:0},cur).hold,null,text);
  }
});

test('R5-1: stored suffix language uses the ask-time accepted body without admitting release or finish prose rejected on fresh asks',()=>{
  for(const text of ['Find Charizard cards in English','Find Pikachu cards in Japanese','Find Charizard cards\n in English']){
    assert.equal(plan(ask(text),null).hold,null,text+' is already admitted at ask time');
    const cur=current(text,text.includes('English')?'ja':'en');
    assert.equal(storedGoalsAccepted(cur),true,text);const p=plan({type:'page',offset:0},cur);
    assert.equal(p.hold,null,text);assert.equal(p.constraints.identity.subject,text.includes('Charizard')?'Charizard':'Pikachu');
  }
  for(const text of ['Find Charizard cards from Base Set in English','Find Charizard holo cards in English','Find Lucario cards in English',
    ' Find Charizard cards in English','Find Charizard cards in English ','Find Charizard cards in English\n','\nFind Charizard cards in English']){
    assert.ok(plan(ask(text),null).hold,text+' must keep its original ask-time hold');
    assert.equal(storedGoalsAccepted(current(text,'ja')),false,text+' may not become a stored exception');
  }
});

test('R5-1: stored suffix canonicalization keeps the ask-time 2000-character forwarded limit across language aliases',t=>{
  let cells=0,admitted=0,held=0;
  for(const language of ['English','Japanese','英文','日文','英語','日本語'])for(const length of [1996,1997,1998,1999,2000]){
    const core='Find Charizard cards in '+language,question=core.replace('Find ','Find '+' '.repeat(length-core.length));
    assert.equal(question.length,length);let fresh=null,error=null;
    try{fresh=plan(ask(question),null);}catch(e){error=e.code||e.message;assert.equal(error,'invalid_action');}
    const accepted=!!fresh&&!fresh.hold&&!fresh.localOnly,cur=current(question,'ja');
    assert.equal(storedGoalsAccepted(cur),accepted,JSON.stringify({language,length,error}));
    const followup=plan({type:'page',offset:0},cur);
    if(accepted){assert.ok(fresh.action.question.length<=2000);assert.equal(followup.hold,null);assert.equal(followup.constraints.identity.subject,'Charizard');admitted++;}
    else{assert.equal(followup.hold?.code,'catalog_stored_goal_requires_restart');held++;}
    cells++;
  }
  assert.equal(cells,30);assert.equal(admitted,21);assert.equal(held,9);assert.equal(attempts.length,0);
  t.diagnostic('30 forwarded-length controls: 21 supported, 9 exact ask-time-limit refusals');
});

test('R5-1: ordinary stored asks enforce normalized size and boundary parity on latest goals and older history',()=>{
  for(const rawLength of [1998,1999,2000]){
    const core='Find Blaﬆoise cards from Base Set',question=core.replace('Find ','Find '+' '.repeat(rawLength-core.length));
    assert.equal(question.length,rawLength);assert.equal(question.normalize('NFKC').length,rawLength+1);
    const allowed=rawLength<2000;
    if(allowed)assert.equal(plan(ask(question),null).hold,null);
    else assert.throws(()=>plan(ask(question),null),/invalid_action/);
    for(const language of [null,'en','ja'])for(const older of [false,true]){
      const cur=older?current(SAFE,language,[ask(question),ask(SAFE)]):current(question,language);
      assert.equal(storedGoalsAccepted(cur),allowed,JSON.stringify({rawLength,language,older}));
      const p=plan({type:'page',offset:0},cur);
      if(allowed){assert.equal(p.hold,null);assert.equal(p.constraints.identity.subject,older?'Charizard':'Blastoise');}
      else assert.equal(p.hold?.code,'catalog_stored_goal_requires_restart');
    }
  }
  for(const core of ['Find Charizard cards from Base Set','Find Pikachu cards from ホロンの幻影'])for(const text of [' '+core,core+' ',core+'\n']){
    assert.ok(plan(ask(text),null).hold);
    for(const language of [null,'en','ja'])for(const older of [false,true]){
      const cur=older?current(SAFE,language,[ask(text),ask(SAFE)]):current(text,language);
      assert.equal(storedGoalsAccepted(cur),false,JSON.stringify({text,language,older}));
      assert.equal(plan({type:'page',offset:0},cur).hold?.code,'catalog_stored_goal_requires_restart');
    }
  }
});

const commercial=['Find Charizard cards 50/usd','Find Charizard cards 10/bucks','Find Charizard cards PSA10','Find Charizard cards BGS9'];
const contradictory=['English Find Japanese Charizard cards','Japanese Find English Charizard cards','English Japanese Find Charizard cards'];
test('R5-3: stored commercial/grade-shaped tokens and unaccepted languages hold as latest goals and older asks',t=>{
  let cells=0;
  for(const base of [...commercial,...contradictory])for(const question of [base,fullwidth(base)])for(const placement of ['latest_goal','older_ask','absent_goal_older_ask']){
    const cur=placement==='latest_goal'?current(question):current(placement==='absent_goal_older_ask'?null:SAFE,null,[ask(question),ask(SAFE)]);
    assert.equal(storedGoalsAccepted(cur),false,base+'/'+placement);
    const p=plan({type:'page',offset:0},cur);assert.equal(p.hold?.code,'catalog_stored_goal_requires_restart');assert.equal(p.localOnly,true);cells++;
  }
  assert.equal(cells,42);assert.equal(attempts.length,0);t.diagnostic('42 money/grade/language latest/history regressions');
});

const injectedNegatives=['not ex','Charizard cards that are not ex','anything but Charizard','no Mitsuhiro Arita please',
  'Charizard cards not by Mitsuhiro Arita','Pokemon cards but exclude Charizard','Charizard cards by Mitsuhiro Arita'];
const followups=[{type:'page',offset:0},{type:'refine',scope:{language:'en'}}];
test('R5-2: every injected negative reply holds before dispatch in recommendation and plain histories, even before a newer safe ask',t=>{
  let cells=0;
  for(const initial of ['Recommend Charizard cards',SAFE])for(const base of injectedNegatives)for(const text of [base,fullwidth(base)])for(const older of [false,true])for(const action of followups){
    const cur=current(initial,null,[ask(initial),reply(text),...(older?[ask(initial)]:[])]);
    assert.equal(storedGoalsAccepted(cur),false,JSON.stringify({initial,text,older}));
    const p=plan(action,cur);assert.equal(p.hold?.code,'catalog_stored_goal_requires_restart');assert.equal(p.localOnly,true);cells++;
  }
  assert.equal(cells,112);assert.equal(attempts.length,0);t.diagnostic('112 injected-reply admission cells; all hold');
});

const storedPositiveReplies=['Base Set','ホロンの幻影','151','SV03.5','SV2A','BASE1','holo','normal','non-holo','精灵球','master ball',
  '006/165','004/SM-P','yes','confirm','yes, that one','はい','确认','是','English','Japanese','English please, no preference for the rest',
  'holo.','yes.','006/165.'];
test('R5-2: exact vocabulary, coordinates, confirmations and bounded language answers remain valid without a prompt field',t=>{
  let cells=0;
  for(const raw of storedPositiveReplies)for(const text of [raw,fullwidth(raw)]){
    const cur=current(SAFE,null,[ask(SAFE),reply(text)]);delete cur.result.next_step;
    assert.equal(storedGoalsAccepted(cur),true,text);assert.equal(plan({type:'page',offset:0},cur).hold,null,text);cells++;
  }
  for(const text of ['holo cards','normal please','yes except Charizard','English or Japanese','Japanese not English','50/usd','10/bucks',
    'PSA10','BGS9','reverse','reverse holo','ミラー','holo..',null,{},''])
    assert.equal(storedGoalsAccepted(current(SAFE,null,[ask(SAFE),reply(text)])),false,JSON.stringify(text));
  assert.equal(cells,50);assert.equal(attempts.length,0);t.diagnostic('50 narrow positive stored replies; exact field-independent forms only');
});

test('R5-2: stored refine, preferences and other typed turns remain unchanged; unsafe ask/reply turns stay held',()=>{
  const typed=[{type:'refine',scope:{language:'ja'}},{type:'preferences',preferences:{currency:'USD',budget_minor:5000}},
    {type:'page',offset:0},{type:'inventory',owned_items:[]},{type:'feedback',card_id:CARD,reaction:'like'}];
  assert.equal(storedGoalsAccepted(current(SAFE,'ja',[ask(SAFE),...typed])),true);
  for(const bad of [ask('Find cards that are not Charizard'),reply('not ex')])
    assert.equal(storedGoalsAccepted(current(SAFE,'ja',[ask(SAFE),...typed,bad,...typed,ask(SAFE)])),false);
});

// Real conversation/private-workspace boundaries with an in-memory catalog
// transport. These fixtures only produce scope-compatible views; the separate
// guarded native replay proves the actual catalog interpretation.
function serviceHarness(){
  const user={id:'round5-service-owner'},owner=createHash('sha256').update(user.id).digest('hex');
  const chats=new Map(),records=new Map(),calls=[];let writes=0;
  const chatStore={async get(o,k,id){return structuredClone(chats.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){chats.set(o+'/'+k+'/'+id,structuredClone(v));},
    async list(o,k){return [...chats].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>structuredClone(v));},async delete(o,k,id){chats.delete(o+'/'+k+'/'+id);}};
  const workspaceStore={async get(o,id){return structuredClone(records.get(o+'/'+id)||null);},async put(o,id,v){writes++;records.set(o+'/'+id,structuredClone(v));},
    async list(o){return [...records].filter(([key])=>key.startsWith(o+'/')).map(([,v])=>structuredClone(v));},async delete(o,id){records.delete(o+'/'+id);}};
  function resultFor(turns){
    const goal=turns.filter(t=>t.type==='ask').at(-1).question;let language=null,preferences={};
    for(const turn of turns){
      if(turn.type==='ask'){const languages=extractSignals(turn.question.normalize('NFKC')).languages;if(languages.length===1)language=languages[0].language;}
      if(turn.type==='refine'&&turn.scope.language)language=turn.scope.language;
      if(turn.type==='reply'){const languages=extractSignals(String(turn.text).normalize('NFKC')).languages;if(languages.length===1)language=languages[0].language;}
      if(turn.type==='preferences')Object.assign(preferences,turn.preferences);
    }
    const cardLanguage=language||(/ホロン/.test(goal)?'ja':'en'),set=cardLanguage==='ja'?'PCG7':'BASE1';
    const card={card_id:cardLanguage+':'+set+':006/102:normal',name:'Charizard',language:cardLanguage,set_code:set,collector_number:'006/102',variant:'normal'};
    const selected=turns.at(-1).type==='select';
    return {goal_question:goal,status:selected?'catalog_target_selected':'candidate_clarification_needed',catalog_revision:'a'.repeat(64),scope_filters:language?{language}:{},
      discovery:{languages:language?[language]:['ja','en']},preferences,candidate_cards:[card],selection_allowed:true,next_step:{field:'variant',prompt:'Which finish?'},
      ...(selected?{selected_catalog_target:card,target_intent:{card_id:card.card_id,transaction_ready:false,physical_printing_verified:false,public_display_allowed:false,automatic_offer_join_allowed:false}}:{})};
  }
  const client={async advance({session,action,limit}){calls.push(structuredClone(action));const turns=[...(session?.turns||[]),structuredClone(action)],result=resultFor(turns);
    return {status:'accepted',session:{schema:'pokemon.pivota-collector-session.v1',turns,limit,expected_revision:'a'.repeat(64)},result,next_step:result.next_step};}};
  const workspace=createPrivateCollectorWorkspace({client,authenticate:async value=>value,store:workspaceStore});
  const make=()=>createConversationService({workspace,authenticate:async value=>value,store:chatStore});
  return {user,owner,chats,records,calls,workspace,service:make(),make,resultFor,get writes(){return writes;}};
}
async function start(h,question){
  let chat=await h.service.create(h.user,{});chat=await h.service.action(h.user,{id:chat.id,version:chat.version,action:ask(question)});
  assert.ok(chat.workspace?.result,question+' fixture seed must be admitted');assert.equal(chat.modelClarificationPending,false,question);return chat;
}

test('R5-1: real service release search, opposite-language refinement, page and selection do not demand a restart',async t=>{
  let flows=0;
  for(const [question,language] of [...releaseCases.filter(([q])=>!q.includes('Lucario')),
    ['Find Charizard cards in English','ja'],['Find Pikachu cards in Japanese','en']]){
    const h=serviceHarness();let chat=await start(h,question);
    chat=await h.service.action(h.user,{id:chat.id,version:chat.version,action:{type:'refine',scope:{language}}});
    chat=await h.service.action(h.user,{id:chat.id,version:chat.version,action:{type:'page',offset:0}});
    assert.equal(chat.modelClarificationPending,false,question);assert.equal(chat.workspace.result.scope_filters.language,language);
    const card=chat.workspace.result.candidate_cards[0];
    chat=await h.service.action(h.user,{id:chat.id,version:chat.version,action:{type:'select',card_id:card.card_id}});
    assert.equal(chat.modelClarificationPending,false);assert.equal(chat.target.card_id,card.card_id);
    const reopened=await h.make().get(h.user,{id:chat.id});assert.equal(reopened.modelClarificationPending,false);assert.equal(reopened.target.card_id,card.card_id);
    assert.equal(h.calls.length,4);flows++;
  }
  assert.equal(flows,8);assert.equal(attempts.length,0);t.diagnostic('8 real-service release/language-switch/page/select/reopen flows');
});

test('R5-2: private locked replay refuses every injected negative before native calls or writes in both modes',async t=>{
  let cells=0;
  for(const initial of ['Recommend Charizard cards',SAFE])for(const text of injectedNegatives)for(const action of followups){
    const h=serviceHarness();let chat=await start(h,initial),key=h.owner+'/'+chat.workspace.id;
    const legacy=h.records.get(key);legacy.session.turns.push(reply(text));h.records.set(key,legacy);
    assert.equal(Object.hasOwn(await h.workspace.get(h.user,legacy.id),'session'),false);
    const before=structuredClone(legacy),native=h.calls.length,writes=h.writes;
    await assert.rejects(h.service.action(h.user,{id:chat.id,version:chat.version,action}),/catalog_stored_goal_requires_restart/,initial+'/'+text);
    assert.equal(h.calls.length,native);assert.equal(h.writes,writes);assert.deepEqual(h.records.get(key),before);
    chat=await h.make().get(h.user,{id:chat.id});assert.equal(chat.modelClarificationPending,true);assert.equal(chat.target,null);
    assert.match(chat.messages.at(-1).text,/Start a new chat/);assert.deepEqual(chat.messages.at(-1).cards,[]);
    await assert.rejects(h.service.action(h.user,{id:chat.id,version:chat.version,action:{type:'select',card_id:chat.workspace.result.candidate_cards[0].card_id}}),/catalog_rejected_action/);
    assert.equal(h.calls.length,native);assert.deepEqual(h.records.get(key),before);cells++;
  }
  assert.equal(cells,28);assert.equal(attempts.length,0);t.diagnostic('28 locked private-history holds, zero native calls/writes on held turns');
});

test('R5-2: every narrow positive reply family still replays through the real service without a stored prompt',async t=>{
  let cells=0;
  for(const initial of ['Recommend Charizard cards',SAFE])for(const text of storedPositiveReplies){
    const h=serviceHarness();let chat=await start(h,initial),key=h.owner+'/'+chat.workspace.id;
    const legacy=h.records.get(key);legacy.session.turns.push(reply(text));legacy.result=h.resultFor(legacy.session.turns);delete legacy.result.next_step;
    legacy.next_step=null;h.records.set(key,legacy);
    const native=h.calls.length;
    chat=await h.service.action(h.user,{id:chat.id,version:chat.version,action:{type:'page',offset:0}});
    assert.equal(h.calls.length,native+1,text);assert.equal(chat.modelClarificationPending,false,text);
    assert.deepEqual(h.records.get(key).session.turns[1],reply(text));cells++;
  }
  assert.equal(cells,50);assert.equal(attempts.length,0);t.diagnostic('50 real-service positive stored-reply replays across both modes');
});
