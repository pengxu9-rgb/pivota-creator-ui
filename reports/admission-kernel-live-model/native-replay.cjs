'use strict';
const guard=require('../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),readline=require('node:readline'),assert=require('node:assert/strict');
const {nativeEcho}=require('../../src/lib/pokemon/admission.cjs');
const {candidateIdentityChecks}=require('../admission-kernel-round3/evidence/identity-oracle.cjs');
const {collectProof,validateProof}=require('../admission-kernel-round3/evidence/pool-proof.cjs');
const ROOT=path.resolve(__dirname,'../..');
function times(){let idle=0,total=0;for(const cpu of os.cpus()){idle+=cpu.times.idle;for(const value of Object.values(cpu.times))total+=value;}return {idle,total};}
async function quiet(){const first=times();await new Promise(r=>setTimeout(r,1000));const last=times(),load=os.loadavg(),idle=100*(last.idle-first.idle)/(last.total-first.total);return {load,idle_percent:idle,logical_cpus:os.cpus().length,eligible:load[0]<=os.cpus().length&&idle>=50};}
const PYTHON_GUARD=String.raw`import atexit,json,runpy,socket,sys
attempts=[]
def audit(event,args):
 if event.startswith('socket.'):
  attempts.append(event)
  raise RuntimeError('offline_network_denied:'+event)
sys.addaudithook(audit)
atexit.register(lambda: print(json.dumps({'python_launcher_network_attempts':len(attempts)}),file=sys.stderr,flush=True))
runpy.run_path(sys.argv[1],run_name='__main__')`;
async function replayNative(items,outputDirectory){
  assert.ok((process.env.NODE_OPTIONS||'').includes('strict-network-guard.cjs'));
  if(!items.length)return {required:0,completed:0,results:[],network_attempts:0,python_network_attempts:0,worker_started:false};
  const eligibility=await quiet();assert.equal(eligibility.eligible,true,'native replay requires load1 <= logical CPUs and measured CPU idle >=50%; wait, do not signal other processes');
  fs.mkdirSync(outputDirectory,{recursive:true});
  const worker=cp.spawn('python3',['-I','-B','-c',PYTHON_GUARD,path.join(ROOT,'reports/admission-kernel/evidence/native-worker.py')],{cwd:ROOT,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
  let stderr='',readyResolve,readyReject,sequence=0;const pending=new Map(),rows=[];
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;}),closed=new Promise(resolve=>worker.once('close',(code,signal)=>resolve({code,signal})));
  worker.stderr.on('data',bytes=>stderr+=bytes);worker.once('error',error=>{readyReject(error);for(const waiter of pending.values())waiter.reject(error);});
  worker.once('exit',code=>{if(code){const error=Error('native_worker_exit_'+code);readyReject(error);for(const waiter of pending.values())waiter.reject(error);}});
  readline.createInterface({input:worker.stdout}).on('line',line=>{try{const value=JSON.parse(line);if(value.ready)readyResolve(value);else{const waiter=pending.get(value.id);if(waiter){pending.delete(value.id);waiter.resolve(value);}}}catch(error){readyReject(error);}});
  const request=request=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.stdin.write(JSON.stringify({id,path:'/collector-journey',request})+'\n');});
  let provenance,close;
  try{
    provenance=await ready;
    for(const item of items){
      const ctx=item.context,current=ctx.current,hasSession=!!current?.session?.turns,turns=hasSession?structuredClone(current.session.turns):
        current?.result?.goal_question?[{type:'ask',question:current.result.goal_question}]:[];
      if(!hasSession&&current?.result?.scope_filters&&Object.keys(current.result.scope_filters).length)turns.push({type:'refine',scope:structuredClone(current.result.scope_filters)});
      if(current?.result?.preferences&&Object.keys(current.result.preferences).length&&!turns.some(t=>t.type==='preferences'))turns.push({type:'preferences',preferences:structuredClone(current.result.preferences)});
      turns.push(structuredClone(item.plan.action));
      const result=await request({turns,limit:current?.session?.limit||5,...(current?{expected_revision:provenance.revision}:{})});
      const row={turn_id:item.turn_id,pass:item.pass,status:result.status,result:result.body,violations:[],checks_incomplete:[],context_reconstruction:hasSession?'frozen historical session':'synthetic accepted fixture reconstructed with its stored goal and explicit typed scope/preferences'};
      if(result.status===200){
        try{nativeEcho(item.plan,result.body);}catch(error){row.violations.push({code:error.code||error.message,gate:'S2'});}
        try{row.identity_checks=candidateIdentityChecks(item.plan,result.body.candidate_cards||[]);}catch(error){row.violations.push({code:'native_identity_mismatch',detail:error.message,gate:'S2'});}
        row.pool_checks=[];
        for(const field of ['variant','set_code']){
          const cards=result.body.candidate_cards||[],observed=[...new Set(cards.map(c=>c[field]))];
          if(cards.length&&observed.length===1&&!Object.hasOwn(item.plan.constraints.scope,field)&&!item.plan.constraints.recordIds?.length){
            if(result.body.discovery?.task!=='character_cards'||item.plan.action.type!=='ask'||/\b(?:recommend|suggest)\b/i.test(item.plan.action.question))row.checks_incomplete.push({field,reason:'uniform_unadmitted_candidate_field_needs_task_specific_complete_pool_proof'});
            else try{
              const collected=await collectProof(item.plan,{task:result.body.discovery.task}),validated=validateProof(collected.proof,{plan:item.plan,cards,field,observed:observed[0],provenance});
              const file=String(item.turn_id).replace(/[^a-z0-9_-]/gi,'_')+'-'+item.pass+'-'+field+'-pool.json';
              fs.writeFileSync(path.join(outputDirectory,file),JSON.stringify(collected,null,2)+'\n');
              row.pool_checks.push({field,status:validated.status,worker_sha256:collected.proof.worker_sha256,pool_card_ids_sha256:collected.proof.pool.card_ids_sha256,pool_count:collected.proof.pool.card_count,python_network_attempts:collected.audit.python_network_attempts});
            }catch(error){row.violations.push({code:'native_pool_not_entailed',detail:error.message,field,gate:'S2'});}
          }
        }
      }else row.native_rejected=true;
      rows.push(row);
    }
  }finally{
    worker.stdin.end();close=await closed;fs.writeFileSync(path.join(outputDirectory,'native-worker.stderr.log'),stderr);
  }
  const audits=stderr.trim().split('\n').flatMap(line=>{try{const value=JSON.parse(line);return Number.isInteger(value.python_network_attempts)||Number.isInteger(value.python_launcher_network_attempts)?[value]:[];}catch{return [];}});
  assert.equal(close.code,0);assert.equal(close.signal,null);assert.equal(audits.length,2,'both native and launcher Python audits required');
  for(const audit of audits)assert.equal(audit.python_network_attempts??audit.python_launcher_network_attempts,0);assert.equal(guard.attempts.length,0);
  fs.writeFileSync(path.join(outputDirectory,'native-results.json'),JSON.stringify({provenance,eligibility,rows,exit_code:close.code,signal:close.signal,audits},null,2)+'\n');
  return {required:items.length,completed:rows.length,results:rows,provenance,network_attempts:0,python_network_attempts:0,worker_started:true};
}
module.exports={replayNative,quiet};
