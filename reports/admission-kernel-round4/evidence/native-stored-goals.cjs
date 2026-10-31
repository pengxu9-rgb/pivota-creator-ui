'use strict';
const {attempts}=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{spawn}=require('node:child_process'),readline=require('node:readline');
const {createCatalogWorkspace}=require('../../../src/lib/pokemon/catalogAdapter.cjs');
const {createConversationService}=require('../../../src/lib/pokemon/conversations.cjs');
const {admit}=require('../../../src/lib/pokemon/admission.cjs');
const {identitySubjects,cardForm}=require('../../admission-kernel-round3/evidence/identity-oracle.cjs');
const {startAudit,finishAudit,ROOT,OUT,write,hash}=require('../../admission-kernel-round3/evidence/audit.cjs');
assert.match(process.env.NODE_OPTIONS||'',/strict-network-guard\.cjs/);
const fold=s=>String(s).normalize('NFKC').toLowerCase();
function matchesSubjectName(subject,value){
  const name=fold(value);
  return subject.aliases.some(alias=>{
    const needle=fold(alias);
    if(/[a-z]/i.test(alias))return new RegExp('(?:^|[^a-z])'+needle+'(?:$|[^a-z])','u').test(name);
    // ミュウ is a substring of ミュウツー. Removing the longer name still
    // preserves an independently named Mew in either tag-team order.
    return (needle==='ミュウ'?name.replaceAll('ミュウツー',''):name).includes(needle);
  });
}
const oracleControls=[
  ['Mew','Mewtwo',false],['Mew','Mewtwo-GX',false],['Mew','ミュウツー',false],['Mew','ミュウツーEX',false],
  ['Mew','ミュウツー&ピカチュウ',false],['Mew','Mew',true],['Mew','ミュウex',true],
  ['Mew','Mew & Mewtwo-GX',true],['Mew','ミュウツー&ミュウGX',true],['Mew','ミュウ&ミュウツーGX',true],
  ['Mewtwo','ミュウツーEX',true],['Snorlax','イーブイ&カビゴンGX',true],
];
for(const [subject,name,expected] of oracleControls)assert.equal(matchesSubjectName(identitySubjects.find(row=>row.name===subject),name),expected,'positive-space oracle control '+subject+' / '+name);
const NEW_OUT=path.resolve(__dirname,'..'),workerFile=path.join(ROOT,'reports/admission-kernel/evidence/native-worker.py');
const newInputs=()=>Object.fromEntries(fs.readdirSync(__dirname).filter(n=>/\.(?:cjs|json|py)$/.test(n)).sort().map(n=>[n,hash(path.join(__dirname,n))]));
const audit=startAudit(__filename),newBefore=newInputs();
const worker=spawn('python3',['-B',workerFile],{cwd:ROOT,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
const closed=new Promise(resolve=>worker.once('close',resolve));
let stderr='',sequence=0,readyResolve,readyReject;
const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),pending=new Map(),calls=[],legacyCases=[],positiveRows=[],failures=[];
worker.stderr.on('data',b=>stderr+=b.toString());
worker.on('error',error=>{readyReject(error);for(const p of pending.values())p.reject(error);});
worker.on('exit',code=>{if(code){const error=Error('native_worker_exit_'+code+': '+stderr);readyReject(error);for(const p of pending.values())p.reject(error);}});
readline.createInterface({input:worker.stdout}).on('line',line=>{try{const v=JSON.parse(line);if(v.ready)readyResolve(v);else{const p=pending.get(v.id);if(p){pending.delete(v.id);p.resolve(v);}}}catch(error){readyReject(error);}});
const python=(pathname,request)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.stdin.write(JSON.stringify({id,path:pathname,request})+'\n');});
const context={id:'offline-round4-native-owner'},authenticate=async c=>c;
function storage(){
  const rows=new Map(),workspaces=new Map();
  return {rows,workspaces,store:{async get(o,k,id){return structuredClone(rows.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){rows.set(o+'/'+k+'/'+id,structuredClone(v));},async list(o,k){return [...rows].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>structuredClone(v));},async delete(o,k,id){rows.delete(o+'/'+k+'/'+id);}},
    workspaceStore:{async get(o,id){return structuredClone(workspaces.get(o+'/'+id)||null);},async put(o,id,v){workspaces.set(o+'/'+id,structuredClone(v));},async list(o){return [...workspaces].filter(([key])=>key.startsWith(o+'/')).map(([,v])=>structuredClone(v));},async delete(o,id){workspaces.delete(o+'/'+id);}}};
}
function fixture(label){
  const s=storage(),workspace=createCatalogWorkspace({authenticate,store:s.workspaceStore,clientOptions:{baseUrl:'https://offline-round4-catalog.invalid',maxAttempts:1,getIdToken:async()=>'offline-fixture-token',fetchImpl:async(url,options)=>{
    assert.equal(url.origin,'https://offline-round4-catalog.invalid');
    const request=options.body?JSON.parse(options.body):null,response=await python(url.pathname,request);
    calls.push({label,path:url.pathname,status:response.status,request,error:response.body?.error});
    return new Response(JSON.stringify(response.body),{status:response.status,headers:{'content-type':'application/json'}});
  }}});
  const make=()=>createConversationService({workspace,store:s.store,authenticate});
  return {...s,workspace,make,service:make()};
}
const held=chat=>!!(chat.modelClarificationPending||chat.languageClarificationPending);
const goalVariants=[
  {id:'visible-negated-character',goal:'English Find cards that are not Charizard',history:'English Find cards that are not Charizard'},
  {id:'visible-negated-suffix',goal:'English Find Charizard cards that are not ex',history:'English Find Charizard cards that are not ex'},
  {id:'hidden-earlier-negation',goal:'English Find Charizard cards',history:'English Find cards that are not Charizard'},
  {id:'absent-goal-hidden-negation',goal:null,history:'English Find cards that are not Charizard'},
];
const followups=['text-reply','typed-reply','refine','page','select','fresh-ask'];
async function legacyCase(spec,followup){
  const label=spec.id+'/'+followup,h=fixture(label);let chat=await h.service.create(context,{});
  chat=await h.service.action(context,{id:chat.id,version:chat.version,action:{type:'ask',question:'Find English Charizard cards'}});
  assert.ok(chat.workspace.result.candidate_cards.length,'seed must contain actual catalog candidates');
  const [key,value]=[...h.workspaces.entries()][0],legacy=structuredClone(value),safeQuestion=legacy.result.goal_question;
  legacy.result.goal_question=spec.goal;
  legacy.result.next_step={field:'variant',prompt:'Which source-declared finish?'};
  legacy.session.turns=[{type:'ask',question:spec.history},{type:'ask',question:safeQuestion}];
  h.workspaces.set(key,legacy);
  const beforeBytes=JSON.stringify(legacy),beforeCalls=calls.length,cardId=legacy.result.candidate_cards[0].card_id;
  let error=null;
  try{
    if(followup==='text-reply')chat=await h.service.send(context,{id:chat.id,version:chat.version,text:'holo'});
    else{
      const action={
        'typed-reply':{type:'reply',text:'holo'},refine:{type:'refine',scope:{variant:'holo'}},page:{type:'page',offset:5},
        select:{type:'select',card_id:cardId},'fresh-ask':{type:'ask',question:'Find Pikachu cards'},
      }[followup];
      chat=await h.service.action(context,{id:chat.id,version:chat.version,action});
    }
  }catch(e){error=e.code||e.message;assert.equal(error,'catalog_stored_goal_requires_restart',label+' unexpected error');chat=await h.make().get(context,{id:chat.id});}
  assert.ok(held(chat),label+' must leave a durable hold');
  assert.equal(calls.length,beforeCalls,label+' must reject before any native dispatch');
  assert.equal(chat.target,null);assert.deepEqual(chat.messages.at(-1).cards,[]);
  assert.match(chat.messages.at(-1).text,/start a new (?:chat|search)/i,label+' must explain recovery');
  assert.equal(JSON.stringify(h.workspaces.get(key)),beforeBytes,label+' must neither migrate nor delete stored data');
  const reopened=await h.make().get(context,{id:chat.id});assert.ok(held(reopened));assert.equal(reopened.target,null);
  await assert.rejects(h.service.action(context,{id:chat.id,version:chat.version,action:{type:'select',card_id:cardId}}),/catalog_rejected_action/);
  await assert.rejects(h.service.bookmarkAdd(context,{conversation_id:chat.id,message_id:chat.messages.at(-1).id,card_id:cardId}),/invalid_chat_request/);
  assert.equal(calls.length,beforeCalls,'reopen, selection and bookmark must not dispatch');
  return {id:label,stored_goal:spec.goal,stored_asks:legacy.session.turns,followup,outcome:'hold_before_native_dispatch',error,native_calls:0,stored_record_unchanged:true,reopen_hold_retained:true,selection_rejected:true,bookmark_rejected:true,assistant_text:chat.messages.at(-1).text};
}
function positiveIdentityChecks(plan,cards){
  const identity=plan.constraints.identity,subject=identitySubjects.find(s=>s.aliases.some(alias=>fold(alias)===fold(identity?.subject))),language=plan.constraints.language;
  assert.ok(subject,'positive sweep must have admitted subject');
  const rows=cards.map(card=>{
    const match=matchesSubjectName(subject,card.name);
    assert.ok(match,'name family mismatch: '+subject.name+' / '+card.name);
    if(identity.form==='ex')assert.equal(cardForm(card),'ex','ex suffix mismatch: '+card.name);
    if(language)assert.equal(card.language,language,'language mismatch');
    return {card_id:card.card_id,name:card.name,language:card.language,subject_alias_matches:true,title_suffix:cardForm(card)};
  });
  return {subject:subject.name,admitted_form:identity.form,admitted_language:language,candidates:rows};
}
async function positiveCase(probe){
  const h=fixture('positive/'+probe.id);let chat=await h.service.create(context,{});
  const doc=[...h.rows.values()][0],binding={owner:crypto.createHash('sha256').update(context.id).digest('hex'),chatId:chat.id,stateVersion:1,workspaceId:null,workspaceVersion:null,deadline:Date.now()+120000};
  const plan=admit({candidate:{action:{type:'ask',question:probe.text}},text:probe.text,ingress:'typed',binding,doc});
  assert.equal(plan.hold,null,'positive query must be kernel-admitted: '+probe.text);
  try{
    chat=await h.service.send(context,{id:chat.id,version:chat.version,text:probe.text});
    assert.equal(held(chat),false,'positive query unexpectedly held');
    const cards=chat.workspace.result.candidate_cards||[],checks=positiveIdentityChecks(plan,cards);
    return {id:probe.id,text:probe.text,outcome:cards.length?'consistent_nonempty':'empty',admitted_plan:{action:plan.action,constraints:plan.constraints},checks};
  }catch(error){
    const label=probe.id==='X_English_Umbreon_ex'&&error.code==='catalog_rejected_action'?'expected_native_rejection':null;
    if(!label)throw error;
    return {id:probe.id,text:probe.text,outcome:label,error:error.code,expected:'native family-context guard, as reported at round-3 head'};
  }
}
let output;
(async()=>{
  const provenance=await ready;
  for(const spec of goalVariants)for(const followup of followups){try{legacyCases.push(await legacyCase(spec,followup));}catch(error){failures.push({case:spec.id+'/'+followup,error:error.stack});}}
  const probes=JSON.parse(fs.readFileSync(path.join(__dirname,'positive-space-probes.json'),'utf8'));
  for(const probe of probes){try{positiveRows.push(await positiveCase(probe));}catch(error){failures.push({case:'positive/'+probe.id,error:error.stack});}}
  const count=outcome=>positiveRows.filter(row=>row.outcome===outcome).length;
  assert.equal(legacyCases.length,24);assert.equal(probes.length,112);
  assert.equal(count('consistent_nonempty'),96);assert.equal(count('empty'),15);assert.equal(count('expected_native_rejection'),1);
  output={schema:'pot.admission.native-stored-goals.round4.v1',...finishAudit(audit),provenance,passed:failures.length===0,real_conversation_service:true,real_private_workspace:true,read_only_native_worker:true,live_calls:0,runtime_identity_echo_added:false,
    evidence_identity_check:'Positive-space results checked offline using admitted subject aliases (tag teams may contain the subject), ex suffix and language. Japanese Mew excludes the longer Mewtwo name unless Mew is independently named. This is not a runtime nativeEcho guard.',identity_oracle_self_checks:oracleControls.length,
    legacy_cases:legacyCases,positive_space:{source_sha256:hash(path.join(__dirname,'positive-space-probes.json')),cases:positiveRows,summary:{probes:probes.length,consistent_nonempty:count('consistent_nonempty'),empty:count('empty'),expected_native_rejection:count('expected_native_rejection'),newly_rejected:0,mismatches:0}},catalog_calls:calls,failures};
})().catch(error=>{output={schema:'pot.admission.native-stored-goals.round4.v1',passed:false,error:{message:error.message,stack:error.stack},legacy_cases:legacyCases,positive_space:{cases:positiveRows},catalog_calls:calls,failures};}).finally(async()=>{
  worker.stdin.end();const code=await closed;
  const guard=stderr.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(row=>Number.isInteger(row?.python_network_attempts));
  Object.assign(output,{node_network_attempts:attempts.length,python_network_attempts:guard?.python_network_attempts??null,python_exit_code:code,worker_sha256:hash(workerFile),round4_evidence_inputs:newBefore,round4_evidence_inputs_unchanged:JSON.stringify(newInputs())===JSON.stringify(newBefore)});
  if(attempts.length||output.python_network_attempts!==0||code!==0||!output.round4_evidence_inputs_unchanged||!output.source_hashes_unchanged||!output.test_hashes_unchanged||!output.evidence_inputs_unchanged||!output.source_head_unchanged)output.passed=false;
  output.exact_exit_code=output.passed?0:1;process.exitCode=output.exact_exit_code;
  fs.writeFileSync(path.join(NEW_OUT,'native-stored-goals.json'),JSON.stringify(output,null,2)+'\n');fs.writeFileSync(path.join(NEW_OUT,'native-stored-goals.stderr.txt'),stderr);
  console.log(JSON.stringify({passed:output.passed,legacy_cases:legacyCases.length,positive_space:output.positive_space?.summary,failures,node_network_attempts:output.node_network_attempts,python_network_attempts:output.python_network_attempts,exit_code:output.exact_exit_code,error:output.error?.message}));
});
