'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {admit,storedGoalsAccepted}=require('../src/lib/pokemon/admission.cjs');
const {renderModelReply}=require('../src/lib/pokemon/modelTurn.cjs');
const {createConversationService}=require('../src/lib/pokemon/conversations.cjs');
const {createPrivateCollectorWorkspace}=require('../src/lib/pokemon/vendor/privateCollector.cjs');
const CARD='en:SV03.5:006/165:holo',OTHER='en:SV03.5:151/165:holo';
const safe='English Find Charizard cards';
const unsafe=['English Find cards that are not Charizard','English Find Charizard cards that are not ex',
  'Find a valuable card other than Pikachu','Find Lucario cards that are not ex','Find Charizard V cards',
  'Find Charizard cards under 50ish','Find Charizard ZZ999 006/XX999','Find cards from set BANANA','Find cards from set ABCDEF'];
const turn=question=>({type:'ask',question});
function current(goal=safe,history){return {id:randomUUID(),version:2,result:{goal_question:goal,scope_filters:{language:'en'},
  discovery:{languages:['en']},preferences:{currency:'USD',budget_minor:5000},candidate_cards:[{card_id:CARD,name:'Charizard ex',language:'en'}],
  next_step:{field:'variant'}},...(history===undefined?{}:{session:{turns:history}})};}
function plan(action,cur,ingress='typed',text=''){
  return admit({candidate:{action},ingress,text,binding:{owner:'offline-owner',chatId:'offline-chat',stateVersion:4,
    workspaceId:cur?.id??null,workspaceVersion:cur?.version??null,deadline:Date.now()+30000},current:cur,doc:{languagePreference:'en'}});
}
const actions=[{type:'reply',text:'holo'},{type:'refine',scope:{variant:'holo'}},{type:'page',offset:5},
  {type:'select',card_id:CARD},{type:'compare',left_card_id:CARD,right_card_id:OTHER},
  {type:'choose_comparison',side:'left',card_id:CARD},{type:'feedback',card_id:CARD,reaction:'like'},
  {type:'preferences',preferences:{budget_minor:6000,currency:'USD'}},{type:'clear_target'},
  {type:'inventory',owned_items:[]},{type:'resolve_owned',item_id:'offline-item',card_id:CARD}];

test('R4-2: every non-ask typed catalog action and text reply re-admits the stored goal before dispatch',()=>{
  for(const goal of unsafe)for(const action of actions){
    const cur=current(goal),before=structuredClone(cur),p=plan(action,cur);
    assert.equal(p.hold?.code,'catalog_stored_goal_requires_restart',goal+'/'+action.type);
    assert.equal(p.localOnly,true);assert.equal(p.action.type,'model_clarification');
    assert.match(renderModelReply(p.action,cur),/Start a new chat/);assert.deepEqual(cur,before,'validation never migrates stored data');
  }
  for(const goal of unsafe){const p=plan({type:'reply',text:'holo'},current(goal),'text','holo');assert.equal(p.hold?.code,'catalog_stored_goal_requires_restart');}
  assert.equal(attempts.length,0);
});

test('R4-2: every exposed stored ask is checked, including an older superseded ask and missing latest goal',()=>{
  for(const goal of [safe,undefined,null])for(const bad of unsafe)for(const history of [
    [turn(bad),{type:'reply',text:'holo'},turn(safe)],
    [turn(safe),turn(bad),turn(safe)],
    [turn(safe),turn(bad)],
  ]){
    const cur=current(goal,history);if(goal===undefined)delete cur.result.goal_question;
    const p=plan({type:'page',offset:5},cur);assert.equal(p.hold?.code,'catalog_stored_goal_requires_restart',JSON.stringify({goal,history}));
  }
  for(const history of [null,{},[turn(null)],[turn('')]])assert.equal(storedGoalsAccepted(current(safe,history)),false);
});

test('R4-2: new asks on unsafe transcripts also hold because native appends instead of clearing history',()=>{
  for(const cur of [current(unsafe[0]),current(safe,[turn(unsafe[0]),turn(safe)])]){
    const p=plan({type:'ask',question:'Find Pikachu cards'},cur);assert.equal(p.hold?.code,'catalog_stored_goal_requires_restart');
  }
  assert.equal(plan({type:'ask',question:'Find Pikachu cards'},null).hold,null,'a new workspace remains the recovery path');
});

test('R4-1/R4-2: a fresh workspace cannot bypass the printed-set guard and no unsafe stored goal masks this regression',()=>{
  for(const base of ['Find cards from set BANANA','Find cards from set ABCDEF'])for(const text of [base,[...base].map(c=>/[!-~]/.test(c)?String.fromCharCode(c.charCodeAt(0)+0xfee0):c).join('')])for(const ingress of ['text','typed']){
    const p=plan({type:'ask',question:text},null,ingress,text);
    assert.equal(p.hold?.field,'compound',base+'/'+ingress);assert.equal(p.localOnly,true);
  }
  assert.equal(plan({type:'ask',question:'Find Charizard cards from set SV03.5'},null).hold,null,'an existing positive subject/release query remains admitted');
});

test('R4-2: positive grammar, existing literals, language-only seeds and absent goals remain admitted',()=>{
  for(const goal of [safe,'Japanese Find Pikachu cards','Find Charizard ex cards','Find Charizard EX cards',
    'Find a valuable card','English Find Lucario cards','English','Japanese','Ｆｉｎｄ Ｐｉｋａｃｈｕ ｃａｒｄｓ']){
    const cur=current(goal,[turn(goal),{type:'page',offset:0}]);
    assert.equal(storedGoalsAccepted(cur),true,goal);assert.equal(plan({type:'page',offset:0},cur).hold,null,goal);
  }
  for(const goal of [null,undefined]){const cur=current(goal);assert.equal(plan({type:'page',offset:0},cur).hold,null);}
  for(const goal of ['',42,{},'Find cards that are not Charizard'])assert.equal(storedGoalsAccepted(current(goal)),false);
});

test('R4-2: only exact distinct-ID server record questions are exceptions to positive grammar',()=>{
  const valid=['Inspect catalog record '+CARD,'Compare '+CARD+' and '+OTHER];
  for(const goal of valid){
    const cur=current(goal,[turn(goal)]),p=plan({type:'page',offset:0},cur);
    assert.equal(p.hold,null,goal);assert.ok(p.constraints.recordIds.includes(CARD));
  }
  for(const goal of ['Inspect catalog record '+CARD+' not ex',' Inspect catalog record '+CARD,'Inspect catalog record '+CARD+'\n',
    'English Inspect catalog record '+CARD,'inspect catalog record '+CARD,'Inspect catalog record en:bad',
    'Compare '+CARD+' and '+CARD,'Compare '+CARD+' and '+OTHER+'\n','Compare '+CARD+' and '+OTHER+' except Pikachu'])
    assert.equal(storedGoalsAccepted(current(goal)),false,goal);
});

function serviceHarness(){
  const user={id:'round4-legacy-offline'},owner=createHash('sha256').update(user.id).digest('hex');
  const chats=new Map(),records=new Map();let nativeCalls=0,writes=0;
  const chatStore={async get(o,k,id){return structuredClone(chats.get(o+'/'+k+'/'+id)||null);},
    async put(o,k,id,v){chats.set(o+'/'+k+'/'+id,structuredClone(v));},async list(o,k){return [...chats].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>structuredClone(v));},async delete(o,k,id){chats.delete(o+'/'+k+'/'+id);}};
  const workspaceStore={async get(o,id){return structuredClone(records.get(o+'/'+id)||null);},
    async put(o,id,v){writes++;records.set(o+'/'+id,structuredClone(v));},async list(o){return [...records].filter(([key])=>key.startsWith(o+'/')).map(([,v])=>structuredClone(v));},async delete(o,id){records.delete(o+'/'+id);}};
  const client={async advance({session,action,limit}){
    nativeCalls++;const turns=[...(session?.turns||[]),structuredClone(action)],question=turns.filter(t=>t.type==='ask').at(-1).question;
    const result={goal_question:question,status:'candidate_clarification_needed',catalog_revision:'a'.repeat(64),scope_filters:{language:'en'},
      discovery:{languages:['en']},preferences:{},candidate_cards:[{card_id:CARD,name:'Charizard ex',language:'en'},
        ...(question.startsWith('Compare ')?[{card_id:OTHER,name:'Mew ex',language:'en'}]:[])],selection_allowed:true,next_step:{field:'variant',prompt:'Which finish?'}};
    return {status:'accepted',session:{schema:'pokemon.pivota-collector-session.v1',turns,limit,expected_revision:'a'.repeat(64)},result,next_step:result.next_step};
  }};
  const workspace=createPrivateCollectorWorkspace({client,authenticate:async value=>value,store:workspaceStore});
  const make=()=>createConversationService({workspace,authenticate:async value=>value,store:chatStore});
  return {user,owner,chats,records,workspace,service:make(),make,get calls(){return nativeCalls;},get writes(){return writes;}};
}
async function initial(h){let chat=await h.service.create(h.user,{});return h.service.action(h.user,{id:chat.id,version:chat.version,action:turn(safe)});}

test('R4-2: real conversation service holds visible legacy goals, survives reopen and never writes or replays the workspace',async()=>{
  for(const goal of unsafe)for(const action of [{type:'reply',text:'holo'},{type:'refine',scope:{variant:'holo'}},{type:'page',offset:5},{type:'select',card_id:CARD}]){
    const h=serviceHarness();let chat=await initial(h);const key=h.owner+'/'+chat.workspace.id,record=h.records.get(key);
    record.result.goal_question=goal;record.session.turns=[turn(goal)];h.records.set(key,record);
    const before=structuredClone(record),calls=h.calls,writes=h.writes;
    chat=await h.service.action(h.user,{id:chat.id,version:chat.version,action});
    assert.equal(chat.modelClarificationPending,true);assert.match(chat.messages.at(-1).text,/Start a new chat/);
    assert.deepEqual(chat.messages.at(-1).cards,[]);assert.equal(chat.target,null);
    const reopened=await h.make().get(h.user,{id:chat.id});assert.equal(reopened.modelClarificationPending,true);assert.equal(reopened.target,null);
    assert.equal(h.calls,calls);assert.equal(h.writes,writes);assert.deepEqual(h.records.get(key),before);
  }
});

test('R4-2: locked private replay checks hidden earlier asks before writes, latches failure and preserves the complete stored transcript',async()=>{
  for(const action of [{type:'page',offset:5},turn('English Find Pikachu cards')]){
    const h=serviceHarness();let chat=await initial(h);const key=h.owner+'/'+chat.workspace.id,record=h.records.get(key);
    record.session.turns=[turn(unsafe[0]),{type:'reply',text:'holo'},turn(safe)];h.records.set(key,record);
    assert.equal(Object.hasOwn(await h.workspace.get(h.user,record.id),'session'),false,'history stays private');
    const before=structuredClone(record),calls=h.calls,writes=h.writes;
    await assert.rejects(h.service.action(h.user,{id:chat.id,version:chat.version,action}),/catalog_stored_goal_requires_restart/);
    assert.equal(h.calls,calls);assert.equal(h.writes,writes);assert.deepEqual(h.records.get(key),before);
    chat=await h.make().get(h.user,{id:chat.id});assert.equal(chat.modelClarificationPending,true);assert.equal(chat.target,null);
    assert.match(chat.messages.at(-1).text,/Start a new chat/);assert.deepEqual(chat.messages.at(-1).cards,[]);
    const doc=[...h.chats.values()].find(row=>row.id===chat.id);assert.equal(doc.admissionFailure,true);
    await assert.rejects(h.service.action(h.user,{id:chat.id,version:chat.version,action:{type:'select',card_id:CARD}}),/catalog_rejected_action/);
    assert.equal(h.calls,calls);assert.deepEqual(h.records.get(key),before);
  }
  assert.equal(attempts.length,0);
});

test('R4-2: safe private history and exact server-record history still allow non-ask replay without migration',async()=>{
  for(const question of [safe,'Inspect catalog record '+CARD,'Compare '+CARD+' and '+OTHER]){
    const h=serviceHarness();let chat=await initial(h);const key=h.owner+'/'+chat.workspace.id,record=h.records.get(key);
    record.result.goal_question=question;record.session.turns=[turn(question)];h.records.set(key,record);
    const calls=h.calls;chat=await h.service.action(h.user,{id:chat.id,version:chat.version,action:{type:'page',offset:0}});
    assert.equal(h.calls,calls+1);assert.equal(chat.modelClarificationPending,false);
    assert.deepEqual(h.records.get(key).session.turns[0],turn(question));
  }
});
