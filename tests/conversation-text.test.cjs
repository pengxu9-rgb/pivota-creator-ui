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
    const result={...(goal.includes('Pikachu')||goal.includes('Mew')?results():missing()),scope_filters:{language:goal.startsWith('English')?'en':'ja'},catalog_revision:REV,turn_count:turns.length,goal_question:goal,preferences:{},card_selection_blockers:{},selection_blockers:[],selected_catalog_target:null,target_intent:null};
    result.discovery.languages=[result.scope_filters.language];if(result.candidate_cards.length)result.candidate_cards=[{...card,language:result.scope_filters.language}];
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

test('an unadmitted spelling correction keeps original text and cannot dispatch or publish cards',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{}),chat=await send(h,empty,'pikacu card');
  assert.deepEqual(h.calls,[]);assert.equal(chat.id,empty.id);assert.equal(chat.version,2);
  assert.equal(chat.messages[0].text,'pikacu card');assert.doesNotMatch(chat.messages[1].text,/interpreted/);assert.deepEqual(chat.messages[1].cards,[]);assert.equal(chat.workspace,null);
  const restored=await h.makeChats().get(h.ctx,{id:chat.id});assert.deepEqual(restored.messages,chat.messages);assert.equal(restored.target,null);
});

test('an admitted explicit query recovers a held typo in the same chat through the workspace boundary',async()=>{
  const h=harness();let c=await send(h,await h.chats.create(h.ctx,{}),'pikacu card');const id=c.id;
  c=await send(h,c,'Find Japanese Pikachu cards');
  assert.equal(c.id,id);assert.ok(c.workspace.id);assert.equal(h.calls.length,1);assert.match(h.calls[0].question,/Pikachu cards/);assert.equal(c.messages.at(-1).cards.length,1);
  assert.equal(c.messages[0].text,'pikacu card');assert.equal(c.messages[2].text,'Find Japanese Pikachu cards');assert.equal(c.target,null);
});

test('the legacy new-question prefix cannot bypass admission or retain a previous target',async()=>{
  const h=harness();let c=await send(h,await h.chats.create(h.ctx,{}),'Find Japanese Pikachu cards');
  c=await h.chats.action(h.ctx,{id:c.id,version:c.version,action:{type:'select',card_id:A}});assert.equal(c.target.card_id,A);
  const id=c.id,wid=c.workspace.id,n=h.calls.length;
  c=await send(h,c,'New question Recommend Japanese Mew cards');
  assert.equal(c.id,id);assert.equal(c.workspace.id,wid);assert.equal(h.calls.length,n);assert.equal(c.target,null);assert.deepEqual(c.messages.at(-1).cards,[]);
  assert.equal(c.messages.at(-2).text,'New question Recommend Japanese Mew cards');
});

test('long and unbound replies never reach native and request-size validation stays intact',async()=>{
  const h=harness();let c=await send(h,await h.chats.create(h.ctx,{}),'Find Japanese Pikachu cards');
  for(const text of ['x'.repeat(201),'New question Recommend '+'M'.repeat(180)+' cards','pikacu '+'x'.repeat(194)]){
    const n=h.calls.length;c=await send(h,c,text);assert.equal(h.calls.length,n);assert.deepEqual(c.messages.at(-1).cards,[]);
  }
  await assert.rejects(send(h,c,'x'.repeat(2001)),/invalid_chat_request/);
  const n=h.calls.length;await assert.rejects(h.chats.action(h.ctx,{id:c.id,version:c.version,action:{type:'reply',text:'pikacu'}}),/catalog_rejected_action/);assert.equal(h.calls.length,n);assert.deepEqual(c.messages.at(-1).cards,[]);
});

test('ownership, version and pending-commerce checks precede any admitted catalog work',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{}),c=await send(h,empty,'Find Japanese Pikachu cards'),n=h.calls.length;
  await assert.rejects(h.chats.send({id:'other'},{id:c.id,version:c.version,text:'Find Japanese Mew cards'}),/chat_not_found/);
  await assert.rejects(send(h,empty,'Find Japanese Mew cards'),/chat_version_conflict/);assert.equal(h.calls.length,n);
  const entry=[...h.records].find(([key])=>key.endsWith('/chats/'+c.id));entry[1].commercePending={id:randomUUID()};h.records.set(entry[0],entry[1]);
  await assert.rejects(send(h,c,'Find Japanese Mew cards'),/logical_turn_in_progress/);assert.equal(h.calls.length,n);
});

test('failure of an admitted query retains the original message and a persisted failed turn',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{});h.intercept(async()=>{throw Object.assign(Error('catalog_timeout'),{code:'catalog_timeout'});});
  await assert.rejects(send(h,empty,'Find Japanese Pikachu cards'),/catalog_timeout/);
  const restored=await h.makeChats().get(h.ctx,{id:empty.id});assert.equal(restored.messages[0].text,'Find Japanese Pikachu cards');assert.equal(restored.messages[1].status,'failed');assert.match(restored.messages[1].text,/timed out/);assert.equal(restored.target,null);
});

test('canceling an admitted turn cannot publish accepted cards or regain target authority',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{});let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);h.intercept(async()=>{entered();await gate;});
  const turn=send(h,empty,'Find Japanese Pikachu cards');
  await Promise.race([waiting,turn.then(
    ()=>assert.fail('the admitted positive query settled before native entry'),
    error=>assert.fail('the admitted positive query rejected before native entry: '+error.code))]);
  assert.equal((await h.chats.cancel(h.ctx,{id:empty.id})).cancellation_requested,true);release();await assert.rejects(turn,/catalog_cancelled/);
  const restored=await h.makeChats().get(h.ctx,{id:empty.id});assert.equal(restored.target,null);assert.equal(restored.messages.at(-1).status,'failed');assert.deepEqual(restored.messages.at(-1).cards,[]);
});

test('a historical pending correction notice is disclosed once without replay during recovery',async()=>{
  const h=harness(),empty=await h.chats.create(h.ctx,{}),entry=[...h.records].find(([key])=>key.endsWith('/chats/'+empty.id));
  const notice=conversationText('pikacu card',null).notice;
  h.records.set(entry[0],{...entry[1],version:1,pending:true,pendingTextNotice:notice,messages:[{id:randomUUID(),role:'user',status:'submitted',text:'pikacu card',createdAt:Date.now()}]});
  const restored=await h.makeChats().get(h.ctx,{id:empty.id});assert.equal(h.calls.length,0);assert.equal(restored.messages.length,2);assert.equal(restored.messages[0].text,'pikacu card');assert.equal(restored.messages[1].status,'failed');assert.match(restored.messages[1].text,/interpreted “pikacu” as “Pikachu”/);assert.equal(restored.target,null);
  assert.deepEqual((await h.makeChats().get(h.ctx,{id:empty.id})).messages,restored.messages);
  assert.equal([...h.records.values()].find(r=>r.id===empty.id).pendingTextNotice,null);
});
