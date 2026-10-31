'use strict';
// Active-task controller only: one owner, one native gate at a time, no daemon
// or schedule. Busy-host refusals are archived and retried after 30 seconds.
const {attempts}=require('../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),OUT=__dirname,phases=['baseline-flows','fixed','round4','round3','round2','original','clarification'];
const startPhase=process.argv[2]||phases[0],startIndex=phases.indexOf(startPhase);assert.ok(startIndex>=0);assert.match(process.env.NODE_OPTIONS||'',/strict-network-guard\.cjs/);
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),gitHead=()=>cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const nonce=crypto.randomUUID(),lockFile=path.join(OUT,'.native-controller.lock.json'),stateFile=path.join(OUT,'native-controller-state.json');
const state={schema:'pot.admission.round5-active-native-controller.v1',controller_pid:process.pid,parent_pid:process.ppid,uid:process.getuid?.(),nonce,head:gitHead(),started_at:new Date().toISOString(),script_sha256:hash(__filename),driver_sha256:hash(path.join(OUT,'run-native-quiet.cjs')),from_phase:startPhase,status:'initializing',active_phase:null,active_driver_pid:null,active_owned_process_group:null,completed:[],refusals:[],attempts:[],network_attempts:0};
const lock=fs.openSync(lockFile,'wx');fs.writeFileSync(lock,JSON.stringify({pid:process.pid,nonce,head:state.head})+'\n');fs.closeSync(lock);
const write=()=>fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n');
let stopping=false,active=null,signalName=null;
function stop(signal){
  stopping=true;signalName=signal;state.status='stopping_by_user_or_parent_signal';state.signal=signal;write();
  // Only the detached group created by this controller is eligible. Native
  // grandchildren inherit that group; unrelated host jobs are never signaled.
  if(active)try{process.kill(-active.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH'){state.stop_error=error.code;write();}}
}
process.on('SIGTERM',()=>stop('SIGTERM'));process.on('SIGINT',()=>stop('SIGINT'));
const sleep=ms=>new Promise(resolve=>{const timer=setTimeout(resolve,ms);const check=setInterval(()=>{if(stopping){clearTimeout(timer);clearInterval(check);resolve();}},250);timer.unref?.();setTimeout(()=>clearInterval(check),ms+10).unref?.();});
function archive(phase,driverLog,receipt,kind){
  const stamp=(receipt?.start?.time||new Date().toISOString()).replace(/[^0-9A-Za-z]/g,'-'),dir=path.join(OUT,'attempts',kind,phase+'-'+stamp+'-'+nonce.slice(0,8));fs.mkdirSync(dir,{recursive:true});
  const files=[path.join(OUT,'quiet-'+phase+'-receipt.json'),driverLog];
  if(receipt?.started){if(receipt.log)files.push(path.join(OUT,receipt.log));for(const file of Object.keys(receipt.produced_artifacts||{}))files.push(path.join(OUT,file));}
  const hashes=[];for(const file of [...new Set(files)])if(fs.existsSync(file)){const rel=path.relative(OUT,file),to=path.join(dir,rel);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(file,to);hashes.push({file:rel,sha256:hash(file)});}
  fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({phase,kind,controller_nonce:nonce,head:state.head,source_files_not_changed:true,files:hashes},null,2)+'\n');return path.relative(ROOT,dir);
}
async function attempt(phase,index){
  assert.equal(gitHead(),state.head,'source head changed during active validation');assert.equal(hash(path.join(OUT,'run-native-quiet.cjs')),state.driver_sha256,'quiet driver changed');
  const driverLog=path.join(OUT,'quiet-'+phase+'-driver.log'),child=cp.spawn(process.execPath,[path.join(OUT,'run-native-quiet.cjs'),phase],{cwd:ROOT,env:{...process.env},detached:true,stdio:['ignore','pipe','pipe']});
  active=child;Object.assign(state,{status:'checking_or_running',active_phase:phase,active_driver_pid:child.pid,active_owned_process_group:child.pid,active_attempt:index});write();
  const stream=fs.createWriteStream(driverLog);let error=null,startNoted=false;
  child.stdout.on('data',b=>stream.write(b));child.stderr.on('data',b=>stream.write(b));child.on('error',e=>{error=e.message;});
  const watch=setInterval(()=>{
    try{const r=JSON.parse(fs.readFileSync(path.join(OUT,'quiet-'+phase+'-receipt.json'),'utf8'));if(r.driver_pid===child.pid&&r.started&&!startNoted){startNoted=true;state.status='native_running';state.active_native_pid=r.child_pid;write();console.log(JSON.stringify({phase,status:'started',controller_pid:process.pid,driver_pid:child.pid,native_pid:r.child_pid,start:r.start}));}}
    catch{}
  },250);
  const result=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  clearInterval(watch);await new Promise(resolve=>stream.end(resolve));active=null;state.active_driver_pid=null;state.active_owned_process_group=null;state.active_native_pid=null;
  let receipt=null;try{receipt=JSON.parse(fs.readFileSync(path.join(OUT,'quiet-'+phase+'-receipt.json'),'utf8'));}catch{}
  const row={phase,index,driver_pid:child.pid,exit_code:result.code,signal:result.signal,error,receipt_driver_pid:receipt?.driver_pid,started:receipt?.started??false};state.attempts.push(row);
  if(stopping){state.status='stopped';row.archive=archive(phase,driverLog,receipt,'native-controller-stopped');write();return 'stopped';}
  assert.equal(error,null);assert.equal(result.signal,null);assert.equal(receipt?.driver_pid,child.pid,'receipt must belong to this exact driver');
  if(result.code===2){assert.equal(receipt.started,false);row.archive=archive(phase,driverLog,receipt,'quiet-host-skips');state.refusals.push({phase,observation:receipt.start,archive:row.archive});state.status='waiting_for_host';write();return 'busy';}
  if(result.code!==0){row.archive=archive(phase,driverLog,receipt,'quiet-native-failure');state.status='gate_failed';write();console.log(JSON.stringify({phase,status:'failed',exit_code:result.code,archive:row.archive}));return 'failed';}
  assert.equal(receipt.started,true);assert.equal(receipt.quiet_start,true);assert.equal(receipt.exit_code,0);state.completed.push(phase);state.status='phase_complete';write();console.log(JSON.stringify({phase,status:'complete',exit_code:0,start:receipt.start,end:receipt.end}));return 'passed';
}
(async()=>{
  state.status='running';write();console.log(JSON.stringify({status:'controller_started',pid:process.pid,nonce,head:state.head,from_phase:startPhase}));
  for(const phase of phases.slice(startIndex)){
    let index=0,lastReason=null;
    while(!stopping){
      const result=await attempt(phase,++index);
      if(result==='passed')break;if(result==='stopped')return;if(result==='failed'){process.exitCode=1;return;}
      const r=state.refusals.at(-1).observation,reason=[r.load[0]>r.logical_cpus?'load':null,r.idle_percent<30?'idle':null].filter(Boolean).join('+');
      if(reason!==lastReason){console.log(JSON.stringify({phase,status:'waiting_for_host',reason,observation:r}));lastReason=reason;}
      await sleep(30000);
    }
    if(stopping)return;
  }
  assert.equal(attempts.length,0);state.status='complete';state.completed_at=new Date().toISOString();state.network_attempts=0;write();console.log(JSON.stringify({status:'controller_complete',pid:process.pid,completed:state.completed,refused_before_start:state.refusals.length,network_attempts:0}));
})().catch(error=>{state.status='controller_error';state.error={message:error.message,stack:error.stack};write();console.error(error);process.exitCode=1;}).finally(()=>{
  if(stopping){state.status='stopped';state.signal=signalName;process.exitCode=signalName==='SIGINT'?130:143;}state.finished_at=new Date().toISOString();state.network_attempts=attempts.length;write();
  const current=JSON.parse(fs.readFileSync(lockFile,'utf8'));if(current.nonce===nonce)fs.unlinkSync(lockFile);
});
