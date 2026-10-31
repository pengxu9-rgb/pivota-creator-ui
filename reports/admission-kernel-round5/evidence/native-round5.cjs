'use strict';
const {attempts}=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process'),Module=require('node:module'),{spawn}=cp,readline=require('node:readline');
assert.match(process.env.NODE_OPTIONS||'',/strict-network-guard\.cjs/);
const ROOT=path.resolve(__dirname,'../../..'),OUT=path.resolve(__dirname,'..'),BASE='8d377d69855f8908a26c1f5a58d6e041a000b86e';
const mode=process.argv[2]||'fixed';assert.ok(['fixed','baseline-flows'].includes(mode));
const hashBytes=b=>crypto.createHash('sha256').update(b).digest('hex'),hash=file=>hashBytes(fs.readFileSync(file));
let baselineOverlay=null;
if(mode==='baseline-flows'){
  const relative='src/lib/pokemon/admission.cjs',file=path.join(ROOT,relative),source=cp.execFileSync('git',['show',BASE+':'+relative],{cwd:ROOT,encoding:'utf8'});
  const otherChanges=cp.execFileSync('git',['diff','--name-only',BASE,'--','src'],{cwd:ROOT,encoding:'utf8'}).trim().split('\n').filter(p=>p&&p!==relative);
  assert.deepEqual(otherChanges,[],'baseline uses unchanged production files except its explicit admission overlay');
  const compiled=new Module(file,module);compiled.filename=file;compiled.paths=Module._nodeModulePaths(path.dirname(file));require.cache[file]=compiled;compiled._compile(source,file);compiled.loaded=true;
  baselineOverlay={base:BASE,file:relative,executed_source_sha256:hashBytes(source),working_file_sha256:hash(file),method:'Exact Git blob compiled in memory before any production import. Other production files are asserted byte-identical to the baseline. No source file is edited.'};
}
const {createCatalogWorkspace}=require('../../../src/lib/pokemon/catalogAdapter.cjs');
const {createCollectorClient}=require('../../../src/lib/pokemon/vendor/collectorClient.cjs');
const {createConversationService}=require('../../../src/lib/pokemon/conversations.cjs');
const {startAudit,finishAudit}=require('../../admission-kernel-round3/evidence/audit.cjs');
const audit=startAudit(__filename),inputs=()=>Object.fromEntries(fs.readdirSync(__dirname).filter(n=>/\.(?:cjs|json|py)$/.test(n)).sort().map(n=>[n,hash(path.join(__dirname,n))])),beforeInputs=inputs();
const workerFile=path.join(ROOT,'reports/admission-kernel/evidence/native-worker.py');
const worker=spawn('python3',['-B',workerFile],{cwd:ROOT,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
const closed=new Promise(resolve=>worker.once('close',resolve));
let stderr='',seq=0,readyResolve,readyReject;
const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),pending=new Map(),catalogCalls=[],flows=[],injected=[],narrow=[],failures=[];
worker.stderr.on('data',b=>stderr+=b.toString());
worker.on('error',error=>{readyReject(error);for(const p of pending.values())p.reject(error);});
worker.on('exit',code=>{if(code){const error=Error('native_worker_exit_'+code+': '+stderr);readyReject(error);for(const p of pending.values())p.reject(error);}});
readline.createInterface({input:worker.stdout}).on('line',line=>{try{const value=JSON.parse(line);if(value.ready)readyResolve(value);else{const p=pending.get(value.id);if(p){pending.delete(value.id);p.resolve(value);}}}catch(error){readyReject(error);}});
const python=(pathname,request)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.stdin.write(JSON.stringify({id,path:pathname,request})+'\n');});
const context={id:'offline-round5-native-owner'},authenticate=async c=>c;
function fixture(label){
  const chats=new Map(),records=new Map();let writes=0;
  const store={async get(o,k,id){return structuredClone(chats.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){chats.set(o+'/'+k+'/'+id,structuredClone(v));},async list(o,k){return [...chats].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>structuredClone(v));},async delete(o,k,id){chats.delete(o+'/'+k+'/'+id);}};
  const workspaceStore={async get(o,id){return structuredClone(records.get(o+'/'+id)||null);},async put(o,id,v){writes++;records.set(o+'/'+id,structuredClone(v));},async list(o){return [...records].filter(([key])=>key.startsWith(o+'/')).map(([,v])=>structuredClone(v));},async delete(o,id){records.delete(o+'/'+id);}};
  const clientOptions={baseUrl:'https://offline-round5-catalog.invalid',maxAttempts:1,getIdToken:async()=>'offline-fixture-token',fetchImpl:async(url,options)=>{
    assert.equal(url.origin,'https://offline-round5-catalog.invalid');
    const request=options.body?JSON.parse(options.body):null,response=await python(url.pathname,request);
    catalogCalls.push({case:label,path:url.pathname,status:response.status,request,error:response.body?.error});
    return new Response(JSON.stringify(response.body),{status:response.status,headers:{'content-type':'application/json'}});
  }};
  const workspace=createCatalogWorkspace({authenticate,store:workspaceStore,clientOptions}),make=()=>createConversationService({workspace,store,authenticate});
  return {chats,records,workspace,make,service:make(),client:createCollectorClient(clientOptions),get writes(){return writes;}};
}
const held=chat=>!!(chat.modelClarificationPending||chat.languageClarificationPending);
const restart=chat=>/older search|start a new chat/i.test(chat.messages.at(-1)?.text||'');
const summarize=chat=>({goal:chat.workspace?.result?.goal_question,scope:chat.workspace?.result?.scope_filters,candidates:(chat.workspace?.result?.candidate_cards||[]).map(c=>c.card_id),hold:held(chat),restart:restart(chat),assistant:chat.messages.at(-1)?.text,target:chat.target??null});
const flowCases=[...require('./review-flows.json').filter(p=>p.id.startsWith('L')),
  {id:'L7_holon_then_english',initial:'Find Pikachu cards from ホロンの幻影',actions:[{type:'refine',scope:{language:'en'}},{type:'page',offset:0}]},
  {id:'L8_prefixed_base_then_japanese',initial:'Find English Charizard cards from Base Set',actions:[{type:'refine',scope:{language:'ja'}},{type:'page',offset:0}]},
  {id:'L9_prefixed_holon_then_english',initial:'Find Japanese Pikachu cards from ホロンの幻影',actions:[{type:'refine',scope:{language:'en'}},{type:'page',offset:0}]},
];
async function flowCase(probe){
  const h=fixture('flow/'+probe.id);let chat=await h.service.create(context,{});const steps=[];
  async function step(label,fn){
    const before=catalogCalls.length;let error=null;
    try{chat=await fn();}catch(e){error=e.code||e.message;chat=await h.make().get(context,{id:chat.id});}
    const row={label,...summarize(chat),native_calls:catalogCalls.length-before,error};steps.push(row);
    if(mode==='baseline-flows'&&row.restart)return false;
    assert.equal(row.restart,false,probe.id+'/'+label+' false stored-goal restart');
    assert.equal(error,null,probe.id+'/'+label+' native failure');assert.equal(row.hold,false,probe.id+'/'+label+' unexpected clarification');return true;
  }
  if(probe.initial&&!await step('initial',()=>h.service.action(context,{id:chat.id,version:chat.version,action:{type:'ask',question:probe.initial}})))return {id:probe.id,steps,false_restart:true};
  for(const text of probe.texts||[])if(!await step('text:'+text,()=>h.service.send(context,{id:chat.id,version:chat.version,text})))return {id:probe.id,steps,false_restart:true};
  for(const action of probe.actions||[])if(!await step('action:'+action.type,()=>h.service.action(context,{id:chat.id,version:chat.version,action})))break;
  return {id:probe.id,steps,false_restart:steps.some(s=>s.restart),selected_first_not_run:!!probe.selectFirst,reason:probe.selectFirst?'This metric isolates restart behavior; native target-evidence selection behavior remains outside this case set.':null};
}
const reviewInject=require('./review-inject.json'),unsafeTexts=[...new Set(reviewInject.flatMap(p=>(p.inject||[]).filter(t=>t.type==='reply'&&t.text!=='holo').map(t=>t.text)))];
async function injectCase(text,kind,followup,sourceIds){
  const id=kind+'/'+followup+'/'+text,h=fixture('injected/'+id);let chat=await h.service.create(context,{});
  chat=await h.service.action(context,{id:chat.id,version:chat.version,action:{type:'ask',question:kind==='recommendation'?'Recommend Charizard cards':'Find Charizard cards'}});
  assert.equal(held(chat),false,'seed must reach native');
  const [key,value]=[...h.records.entries()][0],record=structuredClone(value);
  record.session.turns.push(text===null?{type:'ask',question:'English Find cards that are not Charizard'}:{type:'reply',text});h.records.set(key,record);
  const before=JSON.stringify(record),beforeCalls=catalogCalls.length,beforeWrites=h.writes;
  const action=followup==='page'?{type:'page',offset:0}:{type:'refine',scope:{language:'en'}};
  let error=null;
  try{chat=await h.service.action(context,{id:chat.id,version:chat.version,action});}catch(e){error=e.code||e.message;assert.equal(error,'catalog_stored_goal_requires_restart');chat=await h.make().get(context,{id:chat.id});}
  assert.equal(catalogCalls.length,beforeCalls,'unsafe stored reply must stop before native');assert.equal(h.writes,beforeWrites,'unsafe stored reply must stop before workspace writes');
  assert.equal(JSON.stringify(h.records.get(key)),before);assert.ok(held(chat));assert.ok(restart(chat));assert.equal(chat.target,null);assert.deepEqual(chat.messages.at(-1).cards,[]);
  const reopened=await h.make().get(context,{id:chat.id});assert.ok(held(reopened));assert.equal(reopened.target,null);
  const card=record.result.candidate_cards[0]?.card_id||'en:BASE4:004/130:holo';
  await assert.rejects(h.service.action(context,{id:chat.id,version:chat.version,action:{type:'select',card_id:card}}),/catalog_rejected_action/);
  await assert.rejects(h.service.bookmarkAdd(context,{conversation_id:chat.id,message_id:chat.messages.at(-1).id,card_id:card}),/invalid_chat_request/);
  assert.equal(catalogCalls.length,beforeCalls);
  return {id,text,kind,followup,source_ids:sourceIds,outcome:'hold_before_native_dispatch',error,native_calls:0,workspace_writes:0,stored_record_unchanged:true,reopen_hold_retained:true,selection_rejected:true,bookmark_rejected:true};
}
const narrowCases=[
  ['release','Base Set'],['release','ホロンの幻影'],['release','151'],['finish','holo'],['finish','normal'],['finish','精灵球'],
  ['printed_set','SV03.5'],['collector_number','006/165'],
  ...['yes','confirm','yes, that one','はい','确认','是'].map(s=>['confirmation',s]),
  ['language','English'],['language','Japanese'],['language_answer','English please, no preference for the rest'],
];
async function narrowCase([category,text]){
  const h=fixture('narrow/'+text);let chat=await h.service.create(context,{});
  chat=await h.service.action(context,{id:chat.id,version:chat.version,action:{type:'ask',question:'Find Charizard cards'}});
  const [key,value]=[...h.records.entries()][0],record=structuredClone(value);let seedError=null;
  // Build a schema-validated native transcript and result as a pre-deploy
  // fixture, so a legitimate historical reply's scope is reflected in state.
  try{
    const seed=await h.client.advance({session:record.session,action:{type:'reply',text},limit:record.limit});
    assert.equal(seed.status,'accepted');record.session=seed.session;record.result=seed.result;record.next_step=seed.next_step;
  }catch(e){seedError=e.code||e.message;record.session.turns.push({type:'reply',text});}
  h.records.set(key,record);const beforeCalls=catalogCalls.length;
  let error=null;
  try{chat=await h.service.action(context,{id:chat.id,version:chat.version,action:{type:'page',offset:0}});}catch(e){error=e.code||e.message;chat=await h.make().get(context,{id:chat.id});}
  assert.notEqual(error,'catalog_stored_goal_requires_restart',text+' narrow form cannot acquire a restart hold');
  assert.equal(restart(chat),false,text+' narrow form cannot acquire a restart hold');
  assert.ok(catalogCalls.length>beforeCalls,text+' must replay native');
  return {category,text,seed_native_error:seedError,outcome:error?'native_refusal_after_admitted_replay':'native_replay_accepted',native_calls:catalogCalls.length-beforeCalls,error,result:summarize(chat)};
}
let output;
(async()=>{
  const provenance=await ready;
  for(const probe of flowCases){try{flows.push(await flowCase(probe));}catch(e){failures.push({group:'flow',id:probe.id,error:e.stack});}}
  if(mode==='fixed'){
    for(const text of unsafeTexts)for(const kind of ['recommendation','plain'])for(const followup of ['page','refine']){
      const ids=reviewInject.filter(p=>p.inject?.some(t=>t.type==='reply'&&t.text===text)).map(p=>p.id);
      try{injected.push(await injectCase(text,kind,followup,ids));}catch(e){failures.push({group:'injected',text,kind,followup,error:e.stack});}
    }
    try{injected.push(await injectCase(null,'recommendation','page',['J_ctrl_inject_ask']));}catch(e){failures.push({group:'injected',id:'J_ctrl_inject_ask',error:e.stack});}
    for(const spec of narrowCases){try{narrow.push(await narrowCase(spec));}catch(e){failures.push({group:'narrow',spec,error:e.stack});}}
    assert.equal(injected.length,29);assert.equal(narrow.length,17);assert.ok(flows.every(f=>!f.false_restart));
  }
  assert.equal(flows.length,10);
  output={schema:'pot.admission.round5-native.v1',mode,...finishAudit(audit),baseline_overlay:baselineOverlay,provenance,passed:failures.length===0,
    real_conversation_service:true,real_private_workspace:true,read_only_native_replay:true,live_calls:0,runtime_identity_echo_added:false,
    flow_cases:flows,multi_turn_summary:{cases:flows.length,false_restarts:flows.filter(f=>f.false_restart).length},injected_cases:injected,narrow_positive_cases:narrow,
    narrow_positive_method:'Exact field-independent forms must pass stored admission and reach native. A schema-validated native transcript/result is seeded where possible; native semantic refusal is recorded separately and never counted as successful semantic execution. Echo validation is not loosened.',
    review_inject_source_sha256:hash(path.join(__dirname,'review-inject.json')),review_flow_source_sha256:hash(path.join(__dirname,'review-flows.json')),catalog_fixture_calls:catalogCalls,failures};
})().catch(e=>{output={schema:'pot.admission.round5-native.v1',mode,passed:false,error:{message:e.message,stack:e.stack},baseline_overlay:baselineOverlay,flow_cases:flows,injected_cases:injected,narrow_positive_cases:narrow,catalog_fixture_calls:catalogCalls,failures};}).finally(async()=>{
  worker.stdin.end();const code=await closed;
  const pythonGuard=stderr.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(row=>Number.isInteger(row?.python_network_attempts));
  Object.assign(output,{node_network_attempts:attempts.length,python_network_attempts:pythonGuard?.python_network_attempts??null,python_exit_code:code,worker_sha256:hash(workerFile),round5_evidence_inputs:beforeInputs,round5_evidence_inputs_unchanged:JSON.stringify(inputs())===JSON.stringify(beforeInputs)});
  if(attempts.length||output.python_network_attempts!==0||code!==0||!output.round5_evidence_inputs_unchanged||!output.source_hashes_unchanged||!output.test_hashes_unchanged||!output.evidence_inputs_unchanged||!output.source_head_unchanged)output.passed=false;
  output.exact_exit_code=output.passed?0:1;process.exitCode=output.exact_exit_code;
  const prefix=mode==='fixed'?'native-round5':'native-round5-baseline-flows';
  fs.writeFileSync(path.join(OUT,prefix+'.json'),JSON.stringify(output,null,2)+'\n');fs.writeFileSync(path.join(OUT,prefix+'.stderr.txt'),stderr);
  console.log(JSON.stringify({mode,passed:output.passed,flow_cases:flows.length,false_restarts:output.multi_turn_summary?.false_restarts,injected_cases:injected.length,narrow_positive_cases:narrow.length,narrow_native_refusals:narrow.filter(p=>p.error).length,failures,network_attempts:attempts.length,python_network_attempts:output.python_network_attempts,exit_code:output.exact_exit_code,error:output.error?.message}));
});
