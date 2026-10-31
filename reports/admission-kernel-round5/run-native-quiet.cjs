'use strict';
// Report-level one-gate driver. It refuses to start another native job when
// the observed host is busy; frozen harness code and deadlines are unchanged.
const {attempts}=require('../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),OUT=__dirname,phase=process.argv[2];
const names={
  'baseline-flows':['evidence/native-round5.cjs','baseline-flows','native-baseline-flows-run.log'],
  fixed:['evidence/native-round5.cjs','fixed','native-fixed-run.log'],
  round4:['evidence/run-prior-gate.cjs','round4','prior-round4-run.log'],
  round3:['evidence/run-prior-gate.cjs','round3','prior-round3-run.log'],
  round2:['evidence/run-prior-gate.cjs','round2','prior-round2-run.log'],
  original:['evidence/run-prior-gate.cjs','original','prior-original-run.log'],
  clarification:['evidence/run-prior-gate.cjs','clarification','prior-clarification-run.log'],
};
const produced={
  'baseline-flows':['native-round5-baseline-flows.json','native-round5-baseline-flows.stderr.txt'],
  fixed:['native-round5.json','native-round5.stderr.txt'],
  round4:['prior-round4-native/native-stored-goals.json','round4-invocation.json'],
  round3:['prior-round3-native/native-admitted-replay.json','round3-invocation.json'],
  round2:['prior-round2-native/native-admitted-replay.json','round2-invocation.json'],
  original:['prior-native15/native-replay.json','original-invocation.json'],
  clarification:['clarification/clarification-rate.json','clarification-invocation.json'],
};
assert.ok(names[phase],'choose one known native gate');assert.match(process.env.NODE_OPTIONS||'',/strict-network-guard\.cjs/);
const [script,arg,log]=names[phase],hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const head=()=>cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();
const cpuTimes=()=>os.cpus().reduce((sum,c)=>({idle:sum.idle+c.times.idle,total:sum.total+Object.values(c.times).reduce((a,b)=>a+b,0)}),{idle:0,total:0});
async function observation(){const before=cpuTimes();await new Promise(resolve=>setTimeout(resolve,1000));const after=cpuTimes();return {time:new Date().toISOString(),logical_cpus:os.cpus().length,load:os.loadavg(),idle_percent:100*(after.idle-before.idle)/(after.total-before.total)};}
const auditLines=text=>text.split('\n').flatMap(line=>{try{const row=JSON.parse(line.replace(/^#\s*/,''));return row.strict_network_guard_audit?[row.strict_network_guard_audit]:[];}catch{return [];}});
(async()=>{
  const start=await observation(),sourceHead=head(),receipt={schema:'pot.admission.round5-quiet-gate.v1',phase,head:sourceHead,driver_pid:process.pid,parent_pid:process.ppid,driver_sha256:hash(__filename),script,args:[script,arg],harness_sha256:hash(path.join(OUT,script)),start,
    quiet_start_criteria:{load1_at_most_logical_cpus:true,idle_percent_at_least:30},quiet_start:start.load[0]<=start.logical_cpus&&start.idle_percent>=30,live_calls:0};
  const receiptFile=path.join(OUT,'quiet-'+phase+'-receipt.json');
  if(!receipt.quiet_start){Object.assign(receipt,{started:false,exit_code:2,node_network_attempts:attempts.length});fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({phase,started:false,reason:'host_not_quiet',observation:start}));process.exitCode=2;return;}
  const child=cp.spawn(process.execPath,[path.join(OUT,script),arg],{cwd:ROOT,env:{...process.env},stdio:['ignore','pipe','pipe']});
  receipt.started=true;receipt.child_pid=child.pid;fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');
  const observations=[];let lastTimes=cpuTimes();
  const observer=setInterval(()=>{
    const current=cpuTimes();observations.push({time:new Date().toISOString(),logical_cpus:os.cpus().length,load:os.loadavg(),idle_percent:100*(current.idle-lastTimes.idle)/(current.total-lastTimes.total)});lastTimes=current;
  },5000);
  const stream=fs.createWriteStream(path.join(OUT,log));let stdout='',stderr='',error=null;
  child.stdout.on('data',b=>{stdout+=b.toString();stream.write(b);});child.stderr.on('data',b=>{stderr+=b.toString();stream.write(b);});child.once('error',e=>{error=e.message;});
  const result=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));
  clearInterval(observer);
  await new Promise(resolve=>stream.end(resolve));
  Object.assign(receipt,{exit_code:result.code,signal:result.signal,error,end:await observation(),head_after:head(),harness_unchanged:hash(path.join(OUT,script))===receipt.harness_sha256,log,log_sha256:hash(path.join(OUT,log)),worker_network_audits:auditLines(stdout+'\n'+stderr),node_network_attempts:attempts.length});
  const samples=[receipt.start,...observations,receipt.end];
  Object.assign(receipt,{execution_observations:observations,observation_interval_ms:5000,continuous_quietness_proven:false,resource_observation_note:'Start/end and five-second samples describe observed capacity only; they do not establish continuous quietness. Passing gate status is the actual child exit, not a claim about unsampled host state.',resource_summary:{samples:samples.length,max_observed_load1:Math.max(...samples.map(s=>s.load[0])),min_observed_idle_percent:Math.min(...samples.map(s=>s.idle_percent)),start_eligibility_met:receipt.quiet_start}});
  receipt.produced_artifacts=Object.fromEntries(produced[phase].filter(file=>fs.existsSync(path.join(OUT,file))).map(file=>[file,hash(path.join(OUT,file))]));
  if(result.code===0)assert.equal(Object.keys(receipt.produced_artifacts).length,produced[phase].length,'successful gate must produce every bound artifact');
  receipt.head_unchanged=receipt.head_after===sourceHead;
  fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');
  assert.equal(receipt.signal,null);assert.equal(error,null);assert.equal(receipt.head_unchanged,true);assert.equal(receipt.harness_unchanged,true);assert.ok(receipt.worker_network_audits.length>0);assert.ok(receipt.worker_network_audits.every(a=>a.count===0));assert.equal(attempts.length,0);
  console.log(JSON.stringify({phase,started:true,exit_code:result.code,start:receipt.start,end:receipt.end,node_network_attempts:0}));process.exitCode=result.code??1;
})().catch(error=>{console.error(error);process.exitCode=1;});
