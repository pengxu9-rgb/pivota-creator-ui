'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {conversationText}=require('../src/lib/pokemon/conversationText.cjs');
const source=process.env.POT_CONVERSATION_SOURCE||'../src/lib/pokemon/conversations.cjs';
const {createConversationService}=require(source);
const {createPrivateCollectorWorkspace,createMemoryStore}=require('../src/lib/pokemon/vendor/privateCollector.cjs');
const REV='a'.repeat(64),A='ja:FIX:001/100:normal',B='ja:FIX:002/100:normal';
const missing=()=>({status:'evidence_or_scope_needed',discovery:{task:'need_character_or_coordinates'},candidate_cards:[],selection_blockers:['supported_catalog_scope_needed'],next_step:{field:'collection_evidence',prompt:'Which character should I search?',required_evidence:['explicit_character_artist_or_release_scope']}});
const results=()=>({status:'candidate_clarification_needed',discovery:{task:'character_cards'},candidate_cards:[{card_id:A,name:'Pikachu'}],next_step:{field:'language',prompt:'Which language?'}});

function harness(){
  const records=new Map(),workspaceStore=createMemoryStore(),calls=[];
  const store={async get(o,k,id){return structuredClone(records.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){records.set(o+'/'+k+'/'+id,structuredClone(v));},async list(o,k){return [...records].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>structuredClone(v));},async delete(o,k,id){records.delete(o+'/'+k+'/'+id);}};
  let intercept=async()=>{};
  const client={async advance({session,action,limit,signal}){
    calls.push(structuredClone(action));await intercept(action,signal);
    const turns=[...(session?.turns||[]),action],goal=[...turns].reverse().find(t=>t.type==='ask')?.question||'';
    const card={card_id:goal.includes('Mew')?B:A,name:goal.includes('Mew')?'Mew':'Pikachu'};
    const selected=action.type==='select';
    const result={...(goal.includes('Pikachu')||goal.includes('Mew')?results():missing()),catalog_revision:REV,turn_count:turns.length,goal_question:goal,preferences:{},card_selection_blockers:{},selection_blockers:[],selected_catalog_target:null,target_intent:null};
    if(result.candidate_cards.length)result.candidate_cards=[card];
    if(selected){result.status='catalog_target_selected';result.selected_catalog_target=card;result.target_intent={card_id:action.card_id,transaction_ready:false,physical_printing_verified:false,public_display_allowed:false,automatic_offer_join_allowed:false};}
    return {status:'accepted',session:{schema:'pokemon.pivota-collector-session.v1',turns,limit,expected_revision:REV},result,next_step:result.next_step};
  }};
  const authenticate=async c=>({id:c.id}),makeWorkspace=()=>createPrivateCollectorWorkspace({client,store:workspaceStore,authenticate}),workspace=makeWorkspace();
  const makeChats=()=>createConversationService({workspace,authenticate,store}),chats=makeChats(),ctx={id:'offline-alice'};
  return {chats,makeChats,workspace,store,records,calls,ctx,intercept(fn){intercept=fn;}};
}
const send=(h,c,text,options)=>h.chats.send(h.ctx,{id:c.id,version:c.version,text},options);

test('only the exact known typo is corrected, with an explicit original/corrected notice',()=>{
  for(const raw of ['pikacu card','Recommend Japanese PIKACU cards']){
    const planned=conversationText(raw,null);assert.equal(planned.action.type,'ask');assert.equal(planned.action.question.includes('Pikachu'),true);assert.match(planned.notice,/interpreted/);assert.match(planned.notice,/Pikachu/);
  }
  for(const raw of ['picacu card','pikacufoo card','my_pikacu card','皮pikacu card','Pikachu card','https://example.com/pikacu/card','Inspect catalog record ja:pikacu:001:normal']){
    const planned=conversationText(raw,null);assert.equal(planned.action.question,raw);assert.equal(planned.notice,'');
  }
});

test('a self-contained card goal recovers only an explicitly missing-subject result',()=>{
  for(const raw of ['Japanese Pikachu cards','Recommend Japanese Pikachu cards','Pikachu card','English Mew cards'])assert.deepEqual(conversationText(raw,missing()).action,{type:'ask',question:raw});
  for(const result of [results(),{...missing(),candidate_cards:[{card_id:A}]},{...missing(),status:'catalog_target_selected'},{...missing(),next_step:{field:'card_id'}},{...missing(),discovery:{task:'copy_evidence_needed'}},{...missing(),discovery:{task:'printed_qualifier_scope_needed'}},{...missing(),discovery:{task:'collection_preferences_needed'}},{...missing(),candidate_cards:undefined},{...missing(),selection_blockers:['owned_inventory_resolution']},{...missing(),inventory:{}},{...missing(),next_step:{field:'collection_evidence',required_evidence:['grade_copy_evidence']}}])assert.equal(conversationText('Japanese Pikachu cards',result).action.type,'reply');
});

test('explicit non-negated new questions accept optional colon without reclassifying ordinary replies',()=>{
  for(const raw of ['New question: Recommend Japanese Mew cards','New question Recommend Japanese Mew cards','New collection question：English Mew cards'])assert.equal(conversationText(raw,results()).action.type,'ask',raw);
  const replies=['Japanese','English','173/165','SV2A','holo','normal','master ball','yes','confirm','PSA 10','Pikachu PSA 10 cards','Find Pikachu 173/165 cards','Japanese Pikachu holo cards','Recommend more cards','these cards','New question: do not recommend Mew cards','Do not start a new question Recommend Mew cards','not a New question: Recommend Mew cards','New question: Avoid Mew cards','New question: Pikachu cards without PSA','New question: Compare Pikachu and Mew cards','New question: Find Pikachu seller offers','New question: Pikachu cards https://example.com','Japanese Pikachu cards? Not a new question'];
  for(const raw of replies)for(const result of [missing(),results()])assert.equal(conversationText(raw,result).action.type,'reply',raw);
  for(const negation of ["Don't",'Don’t','Don‘t','Donʼt',"Can't",'Can’t','Cannot','Shouldn’t'])for(const prefix of ['', 'New question: '])assert.equal(conversationText(prefix+negation+' recommend Pikachu cards',missing()).action.type,'reply',prefix+negation);
});

test('the conversation commits original spelling, visible correction and restored trace',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{}),chat=await send(h,empty,'pikacu card');
  assert.deepEqual(h.calls,[{type:'ask',question:'Pikachu card'}]);assert.equal(chat.id,empty.id);assert.equal(chat.version,2);
  assert.equal(chat.messages[0].text,'pikacu card');assert.match(chat.messages[1].text,/interpreted “pikacu” as “Pikachu”/);assert.equal(chat.messages[1].cards.length,1);
  const restored=await h.makeChats().get(h.ctx,{id:chat.id});assert.deepEqual(restored.messages,chat.messages);assert.equal(restored.target,null);
});

test('a legacy missing-subject chat recovers in the same conversation and workspace',async()=>{
  const h=harness();let c=await h.chats.create(h.ctx,{});
  c=await h.chats.action(h.ctx,{id:c.id,version:c.version,action:{type:'ask',question:'pikacu card'}});
  assert.equal(c.workspace.result.discovery.task,'need_character_or_coordinates');assert.equal(c.messages.at(-1).cards.length,0);
  const id=c.id,wid=c.workspace.id;c=await send(h,c,'Japanese Pikachu cards');
  assert.equal(c.id,id);assert.equal(c.workspace.id,wid);assert.deepEqual(h.calls.at(-1),{type:'ask',question:'Japanese Pikachu cards'});assert.equal(c.messages.at(-1).cards.length,1);
  assert.equal(c.messages[0].text,'pikacu card');assert.equal(c.messages[2].text,'Japanese Pikachu cards');
});

test('an explicit new goal uses exact current workspace version and withdraws prior target authority',async()=>{
  const h=harness();let c=await send(h,await h.chats.create(h.ctx,{}),'Recommend Japanese Pikachu cards');
  c=await h.chats.action(h.ctx,{id:c.id,version:c.version,action:{type:'select',card_id:A}});assert.equal(c.target.card_id,A);
  const id=c.id,wid=c.workspace.id,oldVersion=c.version;
  c=await send(h,c,'New question Recommend Japanese Mew cards');
  assert.equal(c.id,id);assert.equal(c.workspace.id,wid);assert.equal(c.version,oldVersion+2);assert.deepEqual(h.calls.at(-1),{type:'ask',question:'Recommend Japanese Mew cards'});
  assert.equal(c.workspace.result.goal_question,'Recommend Japanese Mew cards');assert.equal(c.target,null);assert.equal(c.workspace.saved_decision,null);assert.equal(c.workspace.needs_reconfirmation,true);
  assert.equal(c.messages.at(-2).text,'New question Recommend Japanese Mew cards');
});

test('ordinary replies and structured actions retain existing 200-character boundaries',async()=>{
  const h=harness();let c=await send(h,await h.chats.create(h.ctx,{}),'Pikachu card');
  for(const text of ['Japanese','173/165','holo','PSA 10','yes']){c=await send(h,c,text);assert.deepEqual(h.calls.at(-1),{type:'reply',text});}
  for(const text of ['x'.repeat(201),'New question Recommend '+ 'M'.repeat(180)+' cards','pikacu '+ 'x'.repeat(194)]){const n=h.calls.length;await assert.rejects(send(h,c,text),/chat_reply_too_long/);assert.equal(h.calls.length,n);}
  const exactReply='pikacu '+ 'x'.repeat(193);c=await send(h,c,exactReply);assert.deepEqual(h.calls.at(-1),{type:'reply',text:exactReply});assert.doesNotMatch(c.messages.at(-1).text,/interpreted/);
  c=await h.chats.action(h.ctx,{id:c.id,version:c.version,action:{type:'reply',text:'pikacu'}});assert.deepEqual(h.calls.at(-1),{type:'reply',text:'pikacu'});assert.doesNotMatch(c.messages.at(-1).text,/interpreted/);
  const first=harness(),q='pikacu '+ 'x'.repeat(1993);const fresh=await send(first,await first.chats.create(first.ctx,{}),q);assert.equal(first.calls[0].question,q);assert.equal(fresh.messages[0].text,q);assert.doesNotMatch(fresh.messages[1].text,/interpreted/);
});

test('ownership, version and pending-commerce checks precede any new catalog work',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{}),c=await send(h,empty,'Pikachu card'),n=h.calls.length;
  await assert.rejects(h.chats.send({id:'other'},{id:c.id,version:c.version,text:'New question Recommend Mew cards'}),/chat_not_found/);
  await assert.rejects(send(h,empty,'New question Recommend Mew cards'),/chat_version_conflict/);assert.equal(h.calls.length,n);
  const entry=[...h.records].find(([key])=>key.endsWith('/chats/'+c.id));entry[1].commercePending={id:randomUUID()};h.records.set(entry[0],entry[1]);
  await assert.rejects(send(h,c,'New question Recommend Mew cards'),/logical_turn_in_progress/);assert.equal(h.calls.length,n);
});

test('provider failure retains original spelling and correction on the failed and restored turn',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{});h.intercept(async()=>{throw Object.assign(Error('catalog_timeout'),{code:'catalog_timeout'});});
  await assert.rejects(send(h,empty,'pikacu card'),/catalog_timeout/);
  const restored=await h.makeChats().get(h.ctx,{id:empty.id});assert.equal(restored.messages[0].text,'pikacu card');assert.equal(restored.messages[1].status,'failed');assert.match(restored.messages[1].text,/interpreted “pikacu” as “Pikachu”/);assert.match(restored.messages[1].text,/timed out/);assert.equal(restored.target,null);
  assert.equal([...h.records.values()].find(r=>r.id===empty.id).pendingTextNotice,null);
});

test('canceling a corrected turn cannot publish accepted cards or regain target authority',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{});let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);h.intercept(async()=>{entered();await gate;});
  const turn=send(h,empty,'pikacu card');await waiting;assert.equal((await h.chats.cancel(h.ctx,{id:empty.id})).cancellation_requested,true);release();await assert.rejects(turn,/catalog_cancelled/);
  const restored=await h.makeChats().get(h.ctx,{id:empty.id});assert.equal(restored.target,null);assert.equal(restored.messages.at(-1).status,'failed');assert.deepEqual(restored.messages.at(-1).cards,[]);assert.match(restored.messages.at(-1).text,/interpreted/);
});

test('process-interrupted pending correction is disclosed once during persisted recovery',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{}),entry=[...h.records].find(([key])=>key.endsWith('/chats/'+empty.id));
  const notice=conversationText('pikacu card',null).notice;
  h.records.set(entry[0],{...entry[1],version:1,pending:true,pendingTextNotice:notice,messages:[{id:randomUUID(),role:'user',status:'submitted',text:'pikacu card',createdAt:Date.now()}]});
  const restored=await h.makeChats().get(h.ctx,{id:empty.id});assert.equal(h.calls.length,0);assert.equal(restored.messages.length,2);assert.equal(restored.messages[0].text,'pikacu card');assert.equal(restored.messages[1].status,'failed');assert.match(restored.messages[1].text,/interpreted “pikacu” as “Pikachu”/);assert.equal(restored.target,null);
  assert.deepEqual((await h.makeChats().get(h.ctx,{id:empty.id})).messages,restored.messages);
});
