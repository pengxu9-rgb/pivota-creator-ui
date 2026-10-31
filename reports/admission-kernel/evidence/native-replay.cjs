'use strict';
const {attempts}=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,execFileSync}=require('node:child_process'),readline=require('node:readline'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..'),OUT=path.resolve(__dirname,'..');
const {createCatalogWorkspace}=require('../../../src/lib/pokemon/catalogAdapter.cjs');
const {createConversationService}=require('../../../src/lib/pokemon/conversations.cjs');
const {createModelTurnRouter}=require('../../../src/lib/pokemon/modelTurn.cjs');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function sources(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?sources(path.join(directory,e.name)):[path.join(directory,e.name)]);}
const sourceHashes=()=>Object.fromEntries(sources(path.join(ROOT,'src')).filter(f=>/\.(?:ts|tsx|cjs|json)$/.test(f)).map(f=>[path.relative(ROOT,f),hash(f)]));
const before=sourceHashes(),head=execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const worker=spawn('python3',['-B',path.join(__dirname,'native-worker.py')],{cwd:ROOT,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
const closed=new Promise(resolve=>worker.once('close',resolve));let stderr='',seq=0,readyResolve,readyReject;
const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),pending=new Map(),calls=[],cases=[];
worker.stderr.on('data',bytes=>stderr+=bytes.toString());
worker.on('error',error=>{readyReject(error);for(const waiter of pending.values())waiter.reject(error);});
worker.on('exit',code=>{if(code){const error=Error('native_worker_exit_'+code+': '+stderr);readyReject(error);for(const waiter of pending.values())waiter.reject(error);}});
readline.createInterface({input:worker.stdout}).on('line',line=>{const value=JSON.parse(line);if(value.ready)readyResolve(value);else{const waiter=pending.get(value.id);if(waiter){pending.delete(value.id);waiter.resolve(value);}}});
const python=(pathname,request)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});worker.stdin.write(JSON.stringify({id,path:pathname,request})+'\n');});
const fixtureScenarios=[
  {id:'F1',text:'Show Charizard cards; "English" is just an example',intent:null,initial:'Japanese Charizard cards'},
  {id:'R1_quote',text:'Show Charizard cards; "English" is just an example',intent:'reply',initial:'Japanese Charizard cards'},
  {id:'R1_budget',text:'Find Charizard under USD 100',intent:'reply',initial:'Japanese Charizard cards'},
  {id:'R2',text:'Find English Charizard SV03.5 006/165',intent:'refine_language',initial:'Japanese Pikachu cards'},
  {id:'N1',text:'Find Charizard cards without using English',intent:'search',initial:'Japanese Pikachu cards'},
  {id:'unknown_name_Lucario',text:'Lucario',intent:'reply',initial:'Japanese Pikachu cards'},
  {id:'unknown_name_Vaporeon',text:'Vaporeon',intent:'reply',initial:'Japanese Pikachu cards'},
  {id:'multiple_scope',text:'Find Charizard SV03.5 006/165 or SV4 006/165',intent:'search',initial:'Japanese Pikachu cards'},
  ...['Find Korean Charizard cards','Find French Charizard cards','Find Charizard cards for 100 yuan','Find Charizard cards CHF 100','Find Charizard cards ₹100','Find Charizard cards at most 100','Find Charizard cards with a 100 CAD limit'].map((text,index)=>({id:'broad_signal_'+(index+1),text,intent:'search',initial:'Japanese Pikachu cards'})),
];
function stores(){const rows=new Map(),workspaceRows=new Map();return {store:{async get(o,k,id){return structuredClone(rows.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){rows.set(o+'/'+k+'/'+id,structuredClone(v));},async list(o,k){return [...rows].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>structuredClone(v));},async delete(o,k,id){rows.delete(o+'/'+k+'/'+id);}},workspaceStore:{async get(o,id){return structuredClone(workspaceRows.get(o+'/'+id)||null);},async put(o,id,v){workspaceRows.set(o+'/'+id,structuredClone(v));},async list(o){return [...workspaceRows].filter(([key])=>key.startsWith(o+'/')).map(([,v])=>structuredClone(v));},async delete(o,id){workspaceRows.delete(o+'/'+id);}}};}
async function main(){
  const provenance=await ready,context={id:'offline-admission-native-owner'},authenticate=async ctx=>ctx;
  for(const scenario of fixtureScenarios){
    const storage=stores();let modelCalls=0;
    const workspace=createCatalogWorkspace({authenticate,store:storage.workspaceStore,clientOptions:{baseUrl:'https://offline-admission-catalog.invalid',maxAttempts:1,getIdToken:async()=> 'offline-token-fixture',fetchImpl:async(url,options)=>{
      assert.equal(url.origin,'https://offline-admission-catalog.invalid');const request=options.body?JSON.parse(options.body):null,response=await python(url.pathname,request);
      calls.push({case:scenario.id,path:url.pathname,status:response.status,request,result:{goal_question:response.body.goal_question,scope_filters:response.body.scope_filters,languages:response.body.discovery?.languages,preferences:response.body.preferences,task:response.body.discovery?.task,candidate_card_ids:response.body.candidate_cards?.map(c=>c.card_id)}});
      return new Response(JSON.stringify(response.body),{status:response.status,headers:{'content-type':'application/json'}});
    }}});
    const interpretTurn=scenario.intent?createModelTurnRouter({interpret:async input=>{modelCalls++;return {schema:'pokemon.interpret-turn.v1',state_version:input.state_version,intent:scenario.intent,source_spans:['search','refine_language'].includes(scenario.intent)&&input.text.includes('English')?[{field:'language',text:'English'}]:[],explanation_key:'none',clarification_field:'none'};}}):undefined;
    const make=()=>createConversationService({workspace,store:storage.store,authenticate,interpretTurn});let service=make(),chat=await service.create(context,{});
    chat=await service.action(context,{id:chat.id,version:chat.version,action:{type:'ask',question:scenario.initial}});
    chat=await service.action(context,{id:chat.id,version:chat.version,action:{type:'preferences',preferences:{currency:'USD',budget_minor:100000,grade_company:'PSA',grade_value:'10'}}});
    const nativeBefore=calls.length,priorVersion=chat.workspace.version,priorGoal=chat.workspace.result.goal_question;
    chat=await service.send(context,{id:chat.id,version:chat.version,text:scenario.text});
    assert.ok(chat.languageClarificationPending||chat.modelClarificationPending,scenario.id+' must end in a hold');
    assert.equal(calls.length,nativeBefore,'held case must not reach native parser');assert.equal(chat.target,null);assert.equal(chat.workspace.version,priorVersion);
    assert.equal(chat.workspace.result.goal_question,priorGoal);assert.equal(chat.workspace.result.preferences.budget_minor,100000);
    const reopened=await make().get(context,{id:chat.id});assert.ok(reopened.languageClarificationPending||reopened.modelClarificationPending);assert.equal(reopened.target,null);
    await assert.rejects(service.action(context,{id:chat.id,version:chat.version,action:{type:'select',card_id:chat.workspace.result.candidate_cards?.[0]?.card_id||'ja:SV2A:006/165:holo'}}),/catalog_rejected_action/);
    cases.push({id:scenario.id,user_text:scenario.text,model_intent:scenario.intent||'model_off',initial:scenario.initial,outcome:'hold_before_native_dispatch',native_calls_during_turn:calls.length-nativeBefore,model_fixture_calls:modelCalls,workspace_version_before:priorVersion,workspace_version_after:chat.workspace.version,current_goal:chat.workspace.result.goal_question,languages:chat.workspace.result.discovery?.languages,scope_filters:chat.workspace.result.scope_filters,preferences:chat.workspace.result.preferences,reopen_hold_retained:true,selection_during_hold_rejected:true,assistant_text:chat.messages.at(-1).text});
  }
  return {schema:'pot.admission.native-replay.v1',passed:true,source_head:head,provenance,real_private_workspace:true,real_conversation_service:true,real_catalog_client:true,read_only_native_replay:true,fixture_model_proposals:true,live_calls:0,cases,catalog_calls:calls};
}
let output;
main().then(value=>{output=value;}).catch(error=>{output={schema:'pot.admission.native-replay.v1',passed:false,source_head:head,error:{name:error.name,message:error.message,stack:error.stack},cases,catalog_calls:calls};process.exitCode=1;}).finally(async()=>{
  worker.stdin.end();const code=await closed;
  const nativeGuard=stderr.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(value=>value&&Number.isInteger(value.python_network_attempts));
  output.node_network_attempts=attempts.length;output.python_network_attempts=nativeGuard?.python_network_attempts??null;output.python_exit_code=code;
  output.source_hashes=before;output.source_hashes_unchanged=JSON.stringify(sourceHashes())===JSON.stringify(before);
  output.harness_sha256=hash(__filename);output.worker_sha256=hash(path.join(__dirname,'native-worker.py'));
  if(attempts.length||output.python_network_attempts!==0||code!==0||!output.source_hashes_unchanged){output.passed=false;process.exitCode=1;}
  fs.writeFileSync(path.join(OUT,'native-replay.json'),JSON.stringify(output,null,2)+'\n');fs.writeFileSync(path.join(OUT,'native-worker.stderr.txt'),stderr);
  console.log(JSON.stringify({passed:output.passed,cases:cases.length,node_network_attempts:output.node_network_attempts,python_network_attempts:output.python_network_attempts,error:output.error?.message}));
});
