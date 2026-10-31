'use strict';
// In-memory boundary fixture derived from admission-round6.test.cjs. Results
// echo admitted constraints for service-control checks; they are NOT native
// interpretations. Changed admitted actions are verified separately at native.
const {createHash}=require('node:crypto');
const {admit}=require('../../src/lib/pokemon/admission.cjs');
const {createPrivateCollectorWorkspace}=require('../../src/lib/pokemon/vendor/privateCollector.cjs');
const {createConversationService}=require('../../src/lib/pokemon/conversations.cjs');
const {createModelTurnRouter}=require('../../src/lib/pokemon/modelTurn.cjs');
const FIXED_NOW=1793318400000,CHAT='10000000-0000-4000-8000-000000000001',WORKSPACE='10000000-0000-4000-8000-000000000002';
const copy=v=>structuredClone(v),user={id:'live-model-offline-owner'},owner=createHash('sha256').update(user.id).digest('hex');
function binding(context){return {owner:'live-model-direct-owner',chatId:context.doc.id||CHAT,stateVersion:context.doc.version,
  workspaceId:context.current?.id??null,workspaceVersion:context.current?.version??null,deadline:FIXED_NOW+86400000};}
function planView(plan){return {kind:plan.kind,action:copy(plan.action),languagePreference:plan.languagePreference,
  constraints:copy(plan.constraints),localOnly:plan.localOnly,hold:copy(plan.hold)};}
function canonicalDoc(doc){const value={...copy(doc),id:CHAT,workspaceId:doc.workspaceId?WORKSPACE:null,
  messages:(doc.messages||[]).map(m=>({role:m.role,text:m.text,status:m.status||'accepted'})),pending:null};
  // Request UUIDs are internal reservation correlation, not model input or
  // admission state. Keep outcome metadata while removing replay randomness.
  if(value.modelLast)delete value.modelLast.requestId;
  return value;
}
function createFixture({context=null,interpret=null}={}){
  const chats=new Map(),records=new Map(),calls=[];let writes=0;
  const chatStore={async get(o,k,id){return copy(chats.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){chats.set(o+'/'+k+'/'+id,copy(v));},
    async list(o,k){return [...chats].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>copy(v));},async delete(o,k,id){chats.delete(o+'/'+k+'/'+id);}};
  const store={async get(o,id){return copy(records.get(o+'/'+id)||null);},async put(o,id,v){writes++;records.set(o+'/'+id,copy(v));},
    async list(o){return [...records].filter(([key])=>key.startsWith(o+'/')).map(([,v])=>copy(v));},async delete(o,id){records.delete(o+'/'+id);}};
  let lastResult=context?.current?.result?copy(context.current.result):null;
  const client={async advance({session,action,limit}){
    calls.push(copy(action));const previous=session?.turns||[],turns=[...previous,copy(action)];
    const cur=lastResult?{id:WORKSPACE,version:0,result:lastResult,session:{turns:previous}}:null;
    const ctx={doc:{id:CHAT,version:0,languagePreference:lastResult?.scope_filters?.language||null,messages:[]},current:cur};
    const plan=admit({candidate:{action},text:action.question||action.text||'',ingress:'typed',...ctx,binding:binding(ctx),now:()=>FIXED_NOW});
    if(plan.localOnly)throw Object.assign(Error('fixture_action_not_catalog'),{code:'fixture_action_not_catalog'});
    const goal=turns.filter(t=>t.type==='ask').at(-1)?.question||lastResult?.goal_question||'Find Charizard cards';
    const scope=copy(plan.constraints.scope),lang=plan.constraints.language||'en',pikachu=/Pikachu/i.test(goal),variant=scope.variant||'normal';
    const card={card_id:lang+':BASE1:'+(pikachu?'058/102':'006/102')+':'+variant,name:pikachu?'Pikachu':'Charizard',language:lang,
      set_code:scope.set_code||'BASE1',collector_number:scope.collector_number||(pikachu?'058/102':'006/102'),variant,...scope};
    const result={goal_question:goal,status:action.type==='select'?'catalog_target_selected':'candidate_clarification_needed',catalog_revision:'a'.repeat(64),
      scope_filters:scope,discovery:{languages:plan.constraints.language?[plan.constraints.language]:['ja','en']},preferences:copy(plan.constraints.preferences),
      candidate_cards:[card],selection_allowed:action.type!=='select',next_step:{field:'variant',prompt:'Which finish?'}};
    lastResult=result;
    return {status:'accepted',session:{schema:'pokemon.pivota-collector-session.v1',turns,limit,expected_revision:'a'.repeat(64)},result,next_step:result.next_step};
  }};
  const workspace=createPrivateCollectorWorkspace({client,authenticate:async value=>value,store,now:()=>FIXED_NOW});
  const service=createConversationService({workspace,authenticate:async value=>value,store:chatStore,now:()=>FIXED_NOW,
    ...(interpret?{interpretTurn:createModelTurnRouter({interpret})}:{})});
  const doc={id:CHAT,version:0,title:'Offline model check',createdAt:FIXED_NOW,updatedAt:FIXED_NOW,expiresAt:FIXED_NOW+86400000,
    messages:[],workspaceId:null,pending:null,requiresReconfirmation:true,...canonicalDoc(context?.doc||{id:CHAT,version:0,messages:[],workspaceId:null})};
  if(context?.current?.result){
    doc.workspaceId=WORKSPACE;const current=copy(context.current);
    records.set(owner+'/'+WORKSPACE,{id:WORKSPACE,version:current.version,expiresAt:FIXED_NOW+86400000,
      session:current.session||{schema:'pokemon.pivota-collector-session.v1',turns:[{type:'ask',question:current.result.goal_question}],limit:5,expected_revision:'a'.repeat(64)},
      result:current.result,next_step:current.next_step||current.result.next_step||null,savedDecision:null,needsReconfirmation:true,limit:5});
  }
  chats.set(owner+'/chats/'+CHAT,doc);
  const getDoc=()=>copy(chats.get(owner+'/chats/'+CHAT));
  const snapshot=()=>{
    const d=getDoc(),record=d.workspaceId?records.get(owner+'/'+d.workspaceId):null;
    const current=record?{id:WORKSPACE,version:record.version,result:copy(record.result),session:copy(record.session),next_step:copy(record.next_step)}:null;
    return {doc:canonicalDoc(d),current};
  };
  const send=async text=>service.send(user,{id:CHAT,version:getDoc().version,text});
  const action=async value=>service.action(user,{id:CHAT,version:getDoc().version,action:value});
  const inject=turn=>{const d=getDoc(),record=records.get(owner+'/'+d.workspaceId);if(!record)throw Error('injection_requires_workspace');record.session.turns.push(copy(turn));};
  return {user,owner,service,workspace,chats,records,calls,getDoc,snapshot,send,action,inject,get writes(){return writes;}};
}
module.exports={createFixture,binding,planView,FIXED_NOW,CHAT,WORKSPACE};
