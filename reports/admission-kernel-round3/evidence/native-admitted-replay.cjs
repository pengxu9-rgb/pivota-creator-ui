'use strict';
const {attempts}=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),readline=require('node:readline');
const {admit,nativeEcho}=require('../../../src/lib/pokemon/admission.cjs');
const {createCatalogWorkspace,createCatalogAdapter}=require('../../../src/lib/pokemon/catalogAdapter.cjs');
const {createConversationService}=require('../../../src/lib/pokemon/conversations.cjs');
const {createModelTurnRouter}=require('../../../src/lib/pokemon/modelTurn.cjs');
const {routeChatText}=require('../../../src/lib/pokemon/chatTextIntent.cjs');
const {probes,kernelReplayProbes,source_sha256,fullwidth,mustHold}=require('./probes.cjs');
const {candidateIdentityChecks}=require('./identity-oracle.cjs');
const {collectProof,validateProof}=require('./pool-proof.cjs');
const {startAudit,finishAudit,hash,write,ROOT,OUT}=require('./audit.cjs');
assert.match(process.env.NODE_OPTIONS||'',/strict-network-guard\.cjs/,'guard must be inherited by every child');
const audit=startAudit(__filename),workerFile=path.join(ROOT,'reports/admission-kernel/evidence/native-worker.py');
const devFilter=process.env.ADMISSION_ROUND3_DEV_FILTER?new RegExp(process.env.ADMISSION_ROUND3_DEV_FILTER):null;
const worker=spawn('python3',['-B',workerFile],{cwd:ROOT,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
const closed=new Promise(resolve=>worker.once('close',resolve));
let stderr='',seq=0,readyResolve,readyReject;
const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),pending=new Map(),calls=[],cases=[],directCases=[],failures=[],poolProofs=[];
let nativeProvenance;
worker.stderr.on('data',b=>stderr+=b.toString());
worker.on('error',error=>{readyReject(error);for(const waiter of pending.values())waiter.reject(error);});
worker.on('exit',code=>{if(code){const error=Error('native_worker_exit_'+code+': '+stderr);readyReject(error);for(const waiter of pending.values())waiter.reject(error);}});
readline.createInterface({input:worker.stdout}).on('line',line=>{try{const value=JSON.parse(line);if(value.ready)readyResolve(value);else{const waiter=pending.get(value.id);if(waiter){pending.delete(value.id);waiter.resolve(value);}}}catch(error){readyReject(error);}});
const python=(pathname,request)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.stdin.write(JSON.stringify({id,path:pathname,request})+'\n');});
function stores(){const rows=new Map(),ws=new Map();return {store:{async get(o,k,id){return structuredClone(rows.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){rows.set(o+'/'+k+'/'+id,structuredClone(v));},async list(o,k){return [...rows].filter(([x])=>x.startsWith(o+'/'+k+'/')).map(([,v])=>structuredClone(v));},async delete(o,k,id){rows.delete(o+'/'+k+'/'+id);}},workspaceStore:{async get(o,id){return structuredClone(ws.get(o+'/'+id)||null);},async put(o,id,v){ws.set(o+'/'+id,structuredClone(v));},async list(o){return [...ws].filter(([x])=>x.startsWith(o+'/')).map(([,v])=>structuredClone(v));},async delete(o,id){ws.delete(o+'/'+id);}},rows};}
const summary=r=>r?{goal_question:r.goal_question,status:r.status,scope_filters:r.scope_filters,languages:r.discovery?.languages,task:r.discovery?.task,preferences:r.preferences,candidate_cards:(r.candidate_cards||[]).map(c=>({card_id:c.card_id,language:c.language,variant:c.variant,set_code:c.set_code,collector_number:c.collector_number,name:c.name,dex_id:c.dex_id??c.official_metadata?.official?.dex_id??null})),selection_allowed:r.selection_allowed,next_step:r.next_step?.field}:null;
async function assertNoUnadmitted(plan,result){
  nativeEcho(plan,result);
  const cards=result.candidate_cards||[],scope=plan.constraints.scope;
  const allowedLanguages=plan.constraints.language?[plan.constraints.language]:['ja','en'];
  for(const card of cards)assert.ok(allowedLanguages.includes(card.language),'candidate_language_not_admitted: '+card.language);
  // Native does not echo ask-text filters. A unanimous candidate variant/set
  // absent from the plan is a failure, even when scope_filters is empty.
  const candidateChecks=[{field:'language',admitted:plan.constraints.language,allowed:allowedLanguages,observed_unique:[...new Set(cards.map(c=>c.language))]}];
  for(const field of ['variant','set_code']){
    const observed=[...new Set(cards.map(c=>c[field]))];
    const check={field,admitted:scope[field]??null,observed_unique:observed,all_candidates_share:cards.length>0&&observed.length===1};
    if(cards.length&&observed.length===1&&!Object.hasOwn(scope,field)&&!plan.constraints.recordIds?.length){
      const collected=await collectProof(plan,{task:result.discovery?.task});
      const status=validateProof(collected.proof,{plan,cards,field,observed:observed[0],provenance:nativeProvenance});
      check.pool_proof_index=poolProofs.length;check.proof_status=status;
      poolProofs.push({...collected,validated:status});
    }
    candidateChecks.push(check);
  }
  return [...candidateChecks,...candidateIdentityChecks(plan,cards)];
}
const context={id:'offline-round3-native-owner'},authenticate=async value=>value;
function nativeWorkspace(storage,id){return createCatalogWorkspace({authenticate,store:storage.workspaceStore,clientOptions:{baseUrl:'https://offline-round3-catalog.invalid',maxAttempts:1,getIdToken:async()=>'offline-fixture-token',fetchImpl:async(url,options)=>{
  assert.equal(url.origin,'https://offline-round3-catalog.invalid');
  const request=options.body?JSON.parse(options.body):null,response=await python(url.pathname,request);
  calls.push({case:id,path:url.pathname,status:response.status,request,result:summary(response.body),error:response.body?.error});
  return new Response(JSON.stringify(response.body),{status:response.status,headers:{'content-type':'application/json'}});
}}});}
function router(probe,onCall=()=>{}){return probe.intent?createModelTurnRouter({interpret:async input=>{onCall();return {schema:'pokemon.interpret-turn.v1',state_version:input.state_version,intent:probe.intent,source_spans:probe.spans||[],explanation_key:probe.explanation_key||(probe.intent==='explain'?'current_results':'none'),clarification_field:probe.intent==='clarify'?'task':'none',...(probe.model_extra||{})};}}):undefined;}
function binding(doc,current){return {owner:require('node:crypto').createHash('sha256').update(context.id).digest('hex'),chatId:doc.id,stateVersion:doc.version,workspaceId:current?.id??null,workspaceVersion:current?.version??null,deadline:Date.now()+120000};}
const isHeld=chat=>!!(chat.languageClarificationPending||chat.modelClarificationPending);
async function runProbe(probe){
  const storage=stores(),id=probe.source+'/'+probe.id,workspace=nativeWorkspace(storage,id);let modelCalls=0;
  const interpretTurn=router(probe,()=>modelCalls++),make=()=>createConversationService({workspace,store:storage.store,authenticate,interpretTurn}),service=make();
  let chat=await service.create(context,{});const steps=[];
  const stored=()=>[...storage.rows.values()].find(row=>row.id===chat.id);
  async function step(label,fn,plan=null,expectedHold=false){
    const nativeBefore=calls.length,previous=structuredClone(chat),row={label};
    try{
      chat=await fn();row.ok=true;row.hold=isHeld(chat);row.result=summary(chat.workspace?.result);row.target=chat.target??null;
      if(plan){
        row.admitted_plan={action:plan.action,constraints:plan.constraints,hold:plan.hold,localOnly:plan.localOnly};
        if(plan.hold||expectedHold){assert.ok(isHeld(chat),id+'/'+label+' must hold');assert.equal(calls.length,nativeBefore,'hold must stop before native dispatch');assert.equal(chat.target,null);assert.equal(chat.workspace?.version,previous.workspace?.version);}
        else if(!plan.localOnly){assert.ok(calls.length>nativeBefore,id+'/'+label+' admitted text must reach native');row.candidate_checks=await assertNoUnadmitted(plan,chat.workspace.result);}
      }
      if(isHeld(chat)){
        const reopened=await make().get(context,{id:chat.id});assert.ok(isHeld(reopened),'hold must survive reopen');assert.equal(reopened.target,null);row.reopen_hold_retained=true;
        const fallback=chat.workspace?.result?.candidate_cards?.[0]?.card_id||'en:BASE4:004/130:holo';
        await assert.rejects(service.action(context,{id:chat.id,version:chat.version,action:{type:'select',card_id:fallback}}),/catalog_rejected_action/);row.selection_during_hold_rejected=true;
        const latest=chat.messages.at(-1);assert.deepEqual(latest.cards,[],'a hold must publish no candidate cards');
        await assert.rejects(service.bookmarkAdd(context,{conversation_id:chat.id,message_id:latest.id,card_id:fallback}),/invalid_chat_request/);row.bookmark_from_held_message_rejected=true;
        for(const operation of ['research','select','handoff','psa'])
          await assert.rejects(service.beginCommerce(context,{id:chat.id,version:chat.version,request_id:require('node:crypto').randomUUID(),operation,request:{card_id:fallback}}),/catalog_rejected_action/);
        row.commerce_operations_during_hold_rejected=['research','select','handoff','psa'];
        assert.equal(calls.length,nativeBefore,'clarification authority checks must not invoke native');
      }
    }catch(error){
      row.ok=false;row.error=error.message;row.error_code=error.code||null;
      try{chat=await make().get(context,{id:chat.id});row.reopened_hold=isHeld(chat);row.target=chat.target??null;}catch{}
      const expectedSelectFailure=label.startsWith('action:select')&&isHeld(previous)&&/catalog_rejected_action/.test(row.error);
      const safeEchoFailure=error.code==='catalog_admission_echo_mismatch'&&isHeld(chat)&&stored()?.admissionFailure===true&&chat.target===null;
      if(safeEchoFailure){
        assert.ok(!expectedHold&&!plan?.hold,id+' required pre-dispatch hold cannot be substituted by a native echo rejection');
        assert.deepEqual(chat.messages.at(-1).cards,[]);row.outcome='native_echo_mismatch_latched_before_publication';row.safe_echo_failure=true;
        const fallback=previous.workspace?.result?.candidate_cards?.[0]?.card_id||'en:BASE4:004/130:holo';
        await assert.rejects(service.action(context,{id:chat.id,version:chat.version,action:{type:'select',card_id:fallback}}),/catalog_rejected_action/);row.selection_after_echo_failure_rejected=true;
        await assert.rejects(service.bookmarkAdd(context,{conversation_id:chat.id,message_id:chat.messages.at(-1).id,card_id:fallback}),/invalid_chat_request/);row.bookmark_from_failed_message_rejected=true;
      }
      row.expected_rejection=expectedSelectFailure||safeEchoFailure;
      if(!row.expected_rejection)failures.push({case:id,step:label,error:row.error});
    }
    row.native_calls=calls.length-nativeBefore;steps.push(row);
  }
  await step('initial',()=>service.action(context,{id:chat.id,version:chat.version,action:{type:'ask',question:probe.initial}}));
  if(probe.prefs)await step('preferences',()=>service.action(context,{id:chat.id,version:chat.version,action:{type:'preferences',preferences:probe.prefs}}));
  for(const [index,text] of (probe.texts||[probe.text]).entries()){
    const doc=stored(),current=chat.workspace,candidate=probe.ingress==='typed'?{action:probe.action||{type:'ask',question:text}}:interpretTurn?await router(probe)({text,doc,current}):routeChatText(text,current,doc);
    const ingress=probe.ingress==='typed'?'typed':'text',plan=admit({candidate,text,ingress,binding:binding(doc,current),current,doc});
    await step(ingress+':'+text,()=>ingress==='typed'?service.action(context,{id:chat.id,version:chat.version,action:candidate.action}):service.send(context,{id:chat.id,version:chat.version,text}),plan,index===0&&mustHold(probe));
  }
  for(const action of probe.actions||[]){
    const doc=stored(),current=chat.workspace;let plan=null;
    try{plan=admit({candidate:{action},ingress:'typed',binding:binding(doc,current),current,doc});}catch{}
    await step('action:'+action.type,()=>service.action(context,{id:chat.id,version:chat.version,action}),plan);
  }
  return {id,ingress:probe.ingress||'text',model_intent:probe.intent||'model_off',required_pre_dispatch_hold:mustHold(probe),kernel_fixture_field:probe.kernel_fixture_field,steps,fixture_model_calls:modelCalls,language_preference:stored()?.languagePreference,admission_failure:stored()?.admissionFailure};
}
async function directReplay(text,language,expectedScope,required=true){
  const id='direct:'+(language||'unscoped')+':'+text,storage=stores(),workspace=nativeWorkspace(storage,id),adapter=createCatalogAdapter({workspace,authenticate});
  const doc={id:'direct-native-chat',version:1,languagePreference:language,messages:[]},b=binding(doc,null);
  const plan=admit({candidate:{action:{type:'ask',question:text}},text,ingress:'typed',binding:b,doc});
  if(!required&&plan.hold)return {id,text,admitted_plan:{action:plan.action,constraints:plan.constraints,hold:plan.hold},outcome:'hold_before_native_dispatch',native_calls:0,passed:true};
  assert.equal(plan.hold,null,id+' must be admitted');assert.equal(plan.action.question,plan.action.question.normalize('NFKC'));
  for(const [field,value] of Object.entries(expectedScope))assert.equal(plan.constraints.scope[field],value,id+' scope '+field);
  let result;
  try{result=await adapter.execute(context,plan,{binding:b});}
  catch(error){if(!required&&error.code==='catalog_admission_echo_mismatch')return {id,text,admitted_plan:{action:plan.action,constraints:plan.constraints},outcome:'native_echo_mismatch_before_publication',passed:true};throw error;}
  const checks=await assertNoUnadmitted(plan,result.result);
  assert.ok(result.result.candidate_cards.length,id+' must be a non-vacuous positive control');
  return {id,text,accepted_prior_language:language,admitted_plan:{action:plan.action,constraints:plan.constraints},result:summary(result.result),candidate_checks:checks,passed:true};
}
let output;
(async()=>{
  const provenance=await ready;
  nativeProvenance=provenance;
  for(const probe of [...probes,...kernelReplayProbes].filter(probe=>!devFilter||devFilter.test(probe.source+'/'+probe.id))){try{cases.push(await runProbe(probe));}catch(error){failures.push({case:probe.source+'/'+probe.id,error:error.stack});}if(cases.length%20===0)console.log(JSON.stringify({phase:'native_replay_progress',cases_completed:cases.length,failures:failures.length}));}
  for(const [text,language,scope,required] of [
    ['Find Charizard ex cards','en',{}],
    ['Find Pikachu cards','en',{}],
    ['Find Lucario cards','en',{}],
    ['Find Charizard holo cards','en',{variant:'holo'}],
    ['Find Charizard cards only from Base Set','en',{set_code:'BASE1'}],
    [fullwidth('Find Charizard holo cards'),'en',{variant:'holo'}],
    [fullwidth('Find Charizard cards only from Base Set'),'en',{set_code:'BASE1'}],
    ['Find Ｅｎｇｌｉｓｈ Charizard cards',null,{language:'en'}],
    ['Find Charizard cards',null,{}],
    ['Find Charizard holo cards',null,{variant:'holo'}],
    ...['V','GX','VMAX','VSTAR'].map(form=>['Find Charizard '+form+' cards','en',{},false]),
  ])try{directCases.push(await directReplay(text,language,scope,required));}catch(error){directCases.push({text,passed:false,error:error.stack});failures.push({case:'direct:'+text,error:error.message});}
  output={schema:'pot.admission.native-admitted-replay.round3.v1',passed:failures.length===0,development_filter:devFilter?.source??null,final_evidence:!devFilter,provenance,review_probe_source_sha256:source_sha256,executed_review_probe_cases:cases.filter(row=>row.id.startsWith('probes-')).length,executed_kernel_probe_cases:cases.filter(row=>!row.id.startsWith('probes-')).length,kernel_native_method:'Every kernel fixture also runs as a typed action in a real native conversation. Native supplies the current next-step prompt; synthetic kernel fixture fields are tested separately in admission-round3-parity.test.cjs. A held or echo-rejected turn publishes no cards.',unique_review_probe_scenarios:new Set(probes.map(p=>JSON.stringify({...p,source:undefined}))).size,repeated_review_probe_scenarios:probes.length-new Set(probes.map(p=>JSON.stringify({...p,source:undefined}))).size,candidate_identity_check_fields:['character','title_suffix','variant','set_code'],real_catalog_facade:true,real_private_workspace:true,real_conversation_service:true,read_only_native_replay:true,fixture_model_proposals:true,live_calls:0,pool_proofs:poolProofs,cases,direct_admitted_positive_controls:directCases,catalog_calls:calls,failures};
})().catch(error=>{output={schema:'pot.admission.native-admitted-replay.round3.v1',passed:false,error:{message:error.message,stack:error.stack},pool_proofs:poolProofs,cases,direct_admitted_positive_controls:directCases,catalog_calls:calls,failures};}).finally(async()=>{
  worker.stdin.end();const code=await closed;
  const pythonAudit=stderr.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(row=>row&&Number.isInteger(row.python_network_attempts));
  Object.assign(output,finishAudit(audit),{node_network_attempts:attempts.length,python_network_attempts:pythonAudit?.python_network_attempts??null,python_exit_code:code,worker_sha256:hash(workerFile)});
  Object.assign(output,{pool_proof_worker_count:poolProofs.length,pool_proof_python_network_attempts:poolProofs.reduce((sum,row)=>sum+row.audit.python_network_attempts,0),pool_proof_python_exit_codes:poolProofs.map(row=>row.audit.exit_code)});
  if(attempts.length||output.python_network_attempts!==0||code!==0||!output.source_hashes_unchanged||!output.test_hashes_unchanged||!output.evidence_inputs_unchanged||!output.source_head_unchanged)output.passed=false;
  output.exact_exit_code=output.passed?0:1;process.exitCode=output.exact_exit_code;
  if(devFilter){fs.writeFileSync('/tmp/admission-round3-native-dev.json',JSON.stringify(output,null,2)+'\n');fs.writeFileSync('/tmp/admission-round3-native-dev.stderr.txt',stderr);}
  else{write('native-admitted-replay.json',output);fs.writeFileSync(path.join(OUT,'native-worker.stderr.txt'),stderr);}
  console.log(JSON.stringify({passed:output.passed,cases:cases.length,direct_controls:directCases.length,failures:output.failures,error:output.error?.message,node_network_attempts:output.node_network_attempts,python_network_attempts:output.python_network_attempts,exit_code:output.exact_exit_code}));
});
