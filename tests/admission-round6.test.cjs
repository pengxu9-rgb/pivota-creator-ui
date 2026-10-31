'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
const {admit,storedGoalsAccepted}=require('../src/lib/pokemon/admission.cjs');
const {createConversationService}=require('../src/lib/pokemon/conversations.cjs');
const {createPrivateCollectorWorkspace}=require('../src/lib/pokemon/vendor/privateCollector.cjs');
const ask=question=>({type:'ask',question}),reply=text=>({type:'reply',text});
const modes=['Find Charizard cards','Recommend Charizard cards'];
const confirmations=['yes','confirm','yes, that one','はい','确认','是'];
const negatives={
  collector:['not ex 4/102','anything but Charizard 4/102','Charizard cards not by Mitsuhiro Arita 4/102','not 4/102',
    'Please exclude Charizard; 4/102'],
  set:['not SV1','anything but Charizard SV1','exclude Charizard, only SV1','Please exclude Charizard; SV1'],
  confirmation:['not ex, yes','anything but Charizard, yes','no Mitsuhiro Arita please. 是','Pokemon cards but exclude Charizard. confirm',
    ...confirmations.map(word=>'Please exclude Charizard; '+word)],
};
const positives=['4/102','SV1',...confirmations,'4/102.','SV1!','yes.','是。'];
const followups=[{type:'page',offset:0},{type:'refine',scope:{language:'en'}}];
const laterAsk=initial=>initial.replace('Charizard','Pikachu');
function history(initial,text,older){return [ask(initial),reply(text),...(older?[ask(laterAsk(initial))]:[])];}
function current(initial,text,older){
  return {id:randomUUID(),version:2,result:{goal_question:older?laterAsk(initial):initial,scope_filters:{},
    discovery:{languages:['ja','en']},preferences:{},candidate_cards:[]},session:{turns:history(initial,text,older)}};
}
function plan(action,cur){
  return admit({candidate:{action},ingress:'typed',text:'',current:cur,doc:{},binding:{owner:'round6-owner',chatId:'round6-chat',
    stateVersion:1,workspaceId:cur.id,workspaceVersion:cur.version,deadline:Date.now()+30000}});
}

for(const [family,texts] of Object.entries(negatives))test('R6-1: leading prose cannot acquire stored '+family+' reply authority',t=>{
  let cells=0;
  for(const initial of modes)for(const text of texts)for(const older of [false,true]){
    const cur=current(initial,text,older),before=structuredClone(cur),label=JSON.stringify({family,initial,text,older});
    assert.equal(storedGoalsAccepted(cur),false,label);
    for(const action of followups){const p=plan(action,cur);assert.equal(p.hold?.code,'catalog_stored_goal_requires_restart',label);assert.equal(p.localOnly,true,label);cells++;}
    assert.deepEqual(cur,before,'stored validation must not rewrite the history');
  }
  assert.equal(cells,texts.length*8);assert.equal(attempts.length,0);t.diagnostic(cells+' latest/older, plain/recommendation, page/refine holds');
});

// The real conversation service and locked private workspace run against an
// in-memory catalog transport. Counting that boundary proves held turns never
// dispatch; this fixture does not claim to test native catalog interpretation.
function harness(){
  const user={id:'round6-service-owner'},owner=createHash('sha256').update(user.id).digest('hex');
  const chats=new Map(),records=new Map(),calls=[];let writes=0;
  const chatStore={async get(o,k,id){return structuredClone(chats.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){chats.set(o+'/'+k+'/'+id,structuredClone(v));},
    async list(o,k){return [...chats].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>structuredClone(v));},async delete(o,k,id){chats.delete(o+'/'+k+'/'+id);}};
  const store={async get(o,id){return structuredClone(records.get(o+'/'+id)||null);},async put(o,id,v){writes++;records.set(o+'/'+id,structuredClone(v));},
    async list(o){return [...records].filter(([key])=>key.startsWith(o+'/')).map(([,v])=>structuredClone(v));},async delete(o,id){records.delete(o+'/'+id);}};
  function resultFor(turns){
    const goal=turns.filter(t=>t.type==='ask').at(-1).question,pikachu=goal.includes('Pikachu');
    const card={card_id:pikachu?'en:BASE1:058/102:normal':'en:BASE1:006/102:normal',name:pikachu?'Pikachu':'Charizard',
      language:'en',set_code:'BASE1',collector_number:pikachu?'058/102':'006/102',variant:'normal'};
    return {goal_question:goal,status:'candidate_clarification_needed',catalog_revision:'a'.repeat(64),scope_filters:{},
      discovery:{languages:['ja','en']},preferences:{},candidate_cards:[card],selection_allowed:true,next_step:{field:'variant',prompt:'Which finish?'}};
  }
  const client={async advance({session,action,limit}){calls.push(structuredClone(action));const turns=[...(session?.turns||[]),structuredClone(action)],result=resultFor(turns);
    if(action.type==='refine'&&action.scope.language)result.scope_filters.language=action.scope.language;
    return {status:'accepted',session:{schema:'pokemon.pivota-collector-session.v1',turns,limit,expected_revision:'a'.repeat(64)},result,next_step:result.next_step};}};
  const workspace=createPrivateCollectorWorkspace({client,authenticate:async value=>value,store});
  const service=createConversationService({workspace,authenticate:async value=>value,store:chatStore});
  return {user,owner,records,calls,workspace,service,resultFor,get writes(){return writes;}};
}
async function seed(h,initial,text,older){
  let chat=await h.service.create(h.user,{});chat=await h.service.action(h.user,{id:chat.id,version:chat.version,action:ask(initial)});
  assert.equal(chat.modelClarificationPending,false);assert.equal(h.calls.length,1,'seed must actually cross the catalog boundary');
  const key=h.owner+'/'+chat.workspace.id,record=h.records.get(key);
  record.session.turns=history(initial,text,older);record.result=h.resultFor(record.session.turns);
  h.records.set(key,record);return {chat,key};
}

test('R6-1: every prose-suffixed stored reply holds under the private lock before catalog calls or writes',async t=>{
  let cells=0;
  for(const initial of modes)for(const text of Object.values(negatives).flat())for(const older of [false,true])for(const action of followups){
    const h=harness(),{chat,key}=await seed(h,initial,text,older),before=structuredClone(h.records.get(key));
    const calls=h.calls.length,writes=h.writes,label=JSON.stringify({initial,text,older,action});
    assert.equal(Object.hasOwn(await h.workspace.get(h.user,chat.workspace.id),'session'),false,'public view must hide the injected history');
    await assert.rejects(h.service.action(h.user,{id:chat.id,version:chat.version,action}),error=>{
      assert.equal(error.code,'catalog_stored_goal_requires_restart',label);return true;
    },label);
    assert.equal(h.calls.length-calls,0,'held replay must make zero catalog calls: '+label);
    assert.equal(h.writes-writes,0,'held replay must make zero workspace writes: '+label);
    assert.deepEqual(h.records.get(key),before,'held history must remain unchanged: '+label);cells++;
  }
  assert.equal(cells,152);assert.equal(attempts.length,0);t.diagnostic('152 private-history holds: all 19 texts, both modes/placements/actions, zero dispatches/writes');
});

test('R6-1: bare collector, set and all six confirmation forms still replay through the real service',async t=>{
  let cells=0;
  for(const initial of modes)for(const text of positives)for(const older of [false,true]){
    const cur=current(initial,text,older);assert.equal(storedGoalsAccepted(cur),true,text);assert.equal(plan({type:'page',offset:0},cur).hold,null,text);
    const h=harness(),{chat,key}=await seed(h,initial,text,older),calls=h.calls.length;
    const next=await h.service.action(h.user,{id:chat.id,version:chat.version,action:{type:'page',offset:0}});
    assert.equal(h.calls.length-calls,1,text);assert.equal(next.modelClarificationPending,false,text);
    assert.deepEqual(h.records.get(key).session.turns[1],reply(text),'replay preserves the accepted stored reply');cells++;
  }
  assert.equal(cells,48);assert.equal(attempts.length,0);t.diagnostic('48 positive replays: 12 bare/punctuated forms, both modes and placements');
});
