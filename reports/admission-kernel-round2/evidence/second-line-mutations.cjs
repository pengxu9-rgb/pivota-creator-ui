'use strict';
// The thirteen exact rule deletions from Claude's read-only second-line review.
// Run every test file against every mutant, retaining the exit vector and all
// worker audits. Source snapshots live outside the TypeScript workspace.
const guardState=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const ROOT=path.resolve(__dirname,'../../..'),GUARD=path.join(ROOT,'tests/helpers/strict-network-guard.cjs');
const DEST=path.join(ROOT,'reports/admission-kernel-round2/second-line-mutations');
const PC='src/lib/pokemon/vendor/privateCollector.cjs',AD='src/lib/pokemon/catalogAdapter.cjs',KE='src/lib/pokemon/admission.cjs';
const mutants=[
  {id:'adapter_execute_runs_held_plans',file:AD,from:"if(plan.kind!=='catalog'||plan.localOnly||plan.hold)fail('catalog_rejected_action');",to:"if(plan.kind!=='catalog'||plan.localOnly)fail('catalog_rejected_action');",
    equivalent_reason:'Every hold produced by admit() has a clarification action and localOnly=true. Frozen private-membership plans cannot change that invariant, so the retained localOnly check rejects every held plan.'},
  {id:'adapter_execute_owner_check',file:AD,from:"    async execute(context,plan,{binding,signal,deadline}={}){\n      if(!binding||await actor(context,binding)!==binding.owner)fail('catalog_admission_scope_mismatch');",to:"    async execute(context,plan,{binding,signal,deadline}={}){"},
  {id:'adapter_token_reuse',file:AD,from:'||consume&&invocation.used)',to:')'},
  {id:'adapter_token_binding',file:AD,from:"if(binding.owner!==owner||expectedId!==workspaceId||expectedVersion!==workspaceVersion)fail('catalog_admission_scope_mismatch');",to:''},
  {id:'adapter_save_twice',file:AD,from:'if(!execution||execution.saved||',to:'if(!execution||'},
  {id:'adapter_commerce_version',file:AD,from:'payload.version!==binding.stateVersion||',to:''},
  {id:'adapter_commerce_request_equality',file:AD,from:'||JSON.stringify(payload.request)!==JSON.stringify(plan.request))',to:')'},
  {id:'pc_advance_action_equality',file:PC,from:"if(JSON.stringify(payload.action)!==JSON.stringify(plan.action))fail('catalog_admission_scope_mismatch');",to:''},
  {id:'pc_start_question_equality',file:PC,from:"if(plan.action?.type!=='ask'||payload.question!==plan.action.question)fail('catalog_admission_scope_mismatch');",to:''},
  {id:'pc_publication_echo_removed',file:PC,from:"else require('../catalogAdapter.cjs').validateNativePublication(admission,api,scope,call.result);",to:"else require('../catalogAdapter.cjs').validateInvocation(admission,api,scope);"},
  {id:'pc_save_publication_echo_removed',file:PC,from:"        require('../catalogAdapter.cjs').validateNativePublication(admission,api,\n          {owner:user,workspaceId:record.id,workspaceVersion:record.version,phase:'save'},record.result);",to:''},
  {id:'kernel_final_typed_validation',file:KE,from:'if(!localOnly)typedAction(action,current);',to:''},
  {id:'kernel_echo_candidate_language',file:KE,from:"||\n    (result.candidate_cards||[]).some(c=>c.language!==language)))mismatch();",to:"))mismatch();"},
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function transform(source,mutant){
  assert.equal(source.split(mutant.from).length,2,'mutation target must be unique: '+mutant.id);
  return source.replace(mutant.from,mutant.to);
}
function auditLines(output){
  return output.split('\n').flatMap(line=>{
    try {const item=JSON.parse(line.replace(/^#\s*/,''));return item?.strict_network_guard_audit?[item.strict_network_guard_audit]:[];}catch{return [];}
  });
}
const env=()=>({...process.env,NODE_OPTIONS:'--require='+GUARD});
function summary(output){
  const count=key=>Number(output.match(new RegExp('(?:^|\\n)# '+key+' (\\d+)'))?.[1]||0);
  return {tests:count('tests'),pass:count('pass'),fail:count('fail'),cancelled:count('cancelled'),skipped:count('skipped')};
}
function run(directory,args,log,{timeout=180000,minimumAudits=1}={}){
  return new Promise((resolve,reject)=>{
    const child=cp.spawn(process.execPath,args,{cwd:directory,env:env(),stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',error=null,timedOut=false;
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',text=>{stdout+=text;});child.stderr.on('data',text=>{stderr+=text;});
    child.on('error',err=>{error=err.message;});
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);
    child.on('close',(code,signal)=>{
      clearTimeout(timer);
      try {
        const output=stdout+'\n'+stderr;fs.mkdirSync(path.dirname(log),{recursive:true});fs.writeFileSync(log,output);
        const audits=auditLines(output);
        assert.ok(audits.length>=minimumAudits,'missing worker network audit: '+log);
        assert.ok(audits.every(item=>item.count===0&&item.attempts.length===0),'network attempt: '+log);
        assert.equal(timedOut,false,'worker timed out: '+log);assert.equal(error,null,'worker spawn error: '+log);
        resolve({exit_code:code,signal,error,network_audits:audits,test_counts:summary(stdout),log:path.relative(ROOT,log)});
      }catch(err){reject(err);}
    });
  });
}
async function suite(directory,id,tests,destination=DEST){
  const result={},queue=[...tests];
  async function worker(){
    while(queue.length){const file=queue.shift();result[file]=await run(directory,['--test','--test-reporter=tap',file],path.join(destination,id,path.basename(file)+'.log'),{minimumAudits:2});}
  }
  // Test files are independent Node processes; bounded concurrency keeps the
  // complete per-file matrix practical without changing test execution.
  const workers=await Promise.allSettled(Array.from({length:Math.min(4,tests.length)},worker));
  for(const value of workers)if(value.status==='rejected')throw value.reason;
  return Object.fromEntries(tests.map(file=>[file,result[file]]));
}
function copySnapshot(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const name of ['src','tests','cloud','public','package.json','tsconfig.json','reports/admission-kernel/evidence','reports/admission-kernel-round2/evidence']){
    const source=path.join(from,name);if(fs.existsSync(source))fs.cpSync(source,path.join(to,name),{recursive:true});
  }
  fs.symlinkSync(fs.realpathSync(path.join(ROOT,'node_modules')),path.join(to,'node_modules'),'dir');
}
function manifest(directory){
  function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    if(entry.name==='node_modules')return [];
    const full=path.join(dir,entry.name);return entry.isDirectory()?files(full):[{file:path.relative(directory,full),sha256:sha(fs.readFileSync(full))}];
  });}
  return files(directory);
}
function writeTable(output){
  const files=output.test_files;
  const header='| Mutant | '+files.map(file=>path.basename(file)).join(' | ')+' | Outcome |\n| --- | '+files.map(()=> '---').join(' | ')+' | --- |\n';
  const rows=output.rows.map(row=>'| '+row.mutant+' | '+files.map(file=>String(row.results[file].exit_code)).join(' | ')+' | '+(row.killed?'killed':'equivalent')+' |').join('\n');
  const equivalent=output.rows.filter(row=>row.equivalent_reason).map(row=>'- `'+row.mutant+'`: '+row.equivalent_reason).join('\n');
  fs.writeFileSync(path.join(ROOT,'reports/admission-kernel-round2/second-line-mutation-table.md'),header+rows+'\n\nEvery cell runs that complete test file. A zero is exit 0; a nonzero is a test failure. Syntax checks are separate and must exit 0. Every recorded worker audit has zero attempts.\n\n'+equivalent+'\n');
}
async function main(){
  assert.equal(mutants.length,13);
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pot-admission-round2-mutants-'));
  const snapshot=path.join(scratch,'snapshot'),rows=[];
  const output={schema:'pot.admission.second-line-mutations.v2',review_reference:'outputs/admission-kernel-claude-review-20261028/repro/second-line-mutants.cjs',
    source_head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),guard:GUARD,
    scratch_outside_workspace:!scratch.startsWith(ROOT+path.sep),test_files:[],source_manifest:[],baseline:null,baseline_full_suite:null,rows};
  const write=()=>fs.writeFileSync(path.join(ROOT,'reports/admission-kernel-round2/second-line-mutations.json'),JSON.stringify(output,null,2)+'\n');
  fs.mkdirSync(DEST,{recursive:true});
  try {
    copySnapshot(ROOT,snapshot);output.source_manifest=manifest(snapshot);
    const tests=fs.readdirSync(path.join(snapshot,'tests')).filter(file=>file.endsWith('.test.cjs')).sort().map(file=>'tests/'+file);output.test_files=tests;
    output.baseline_full_suite=await run(snapshot,['--test','--test-reporter=tap',...tests],path.join(DEST,'baseline','full-suite.log'),{timeout:300000,minimumAudits:tests.length+1});
    assert.equal(output.baseline_full_suite.exit_code,0,'baseline full suite must pass');
    output.baseline=await suite(snapshot,'baseline',tests);write();
    assert.ok(Object.values(output.baseline).every(value=>value.exit_code===0),'baseline per-file suite must pass');
    console.log(JSON.stringify({phase:'baseline',files:tests.length,tests:output.baseline_full_suite.test_counts,network_attempts:0}));
    for(const mutant of mutants){
      const directory=path.join(scratch,mutant.id);copySnapshot(snapshot,directory);
      try {
        const file=path.join(directory,mutant.file),source=fs.readFileSync(file,'utf8'),changed=transform(source,mutant);fs.writeFileSync(file,changed);
        const syntax=await run(directory,['--check',file],path.join(DEST,mutant.id,'syntax.log'));
        assert.equal(syntax.exit_code,0,'syntax-invalid mutation cannot count as killed: '+mutant.id);
        const results=await suite(directory,mutant.id,tests),failing=tests.filter(file=>results[file].exit_code!==0);
        rows.push({mutant:mutant.id,file:mutant.file,original_sha256:sha(source),mutant_sha256:sha(changed),
          transform:{from:mutant.from,to:mutant.to},syntax,killed:failing.length>0,failing_files:failing,
          ...(mutant.equivalent_reason?{equivalent_reason:mutant.equivalent_reason}:{}),results});
        write();writeTable(output);
        console.log(JSON.stringify({mutant:mutant.id,killed:failing.length>0,failing_files:failing,network_attempts:0}));
      }finally{fs.rmSync(directory,{recursive:true,force:true});}
    }
    output.network_attempts=guardState.attempts.length;
    output.network_audit_count=output.baseline_full_suite.network_audits.length+
      Object.values(output.baseline).reduce((n,row)=>n+row.network_audits.length,0)+
      rows.reduce((n,row)=>n+row.syntax.network_audits.length+Object.values(row.results).reduce((v,cell)=>v+cell.network_audits.length,0),0);
    assert.equal(output.network_attempts,0);
    assert.ok(rows.every(row=>row.killed||row.equivalent_reason),'unexplained surviving mutants');
    assert.equal(rows.find(row=>row.mutant==='adapter_execute_runs_held_plans').killed,false,'expected equivalent changed');
    output.complete=true;
  }finally{
    fs.rmSync(scratch,{recursive:true,force:true});output.scratch_cleaned=!fs.existsSync(scratch);write();
  }
  console.log(JSON.stringify({mutants:rows.length,killed:rows.filter(row=>row.killed).length,equivalent:rows.filter(row=>!row.killed).length,
    network_attempts:output.network_attempts,network_audit_count:output.network_audit_count,scratch_cleaned:output.scratch_cleaned}));
  return output;
}
module.exports={mutants,transform,main,run,suite,copySnapshot,manifest,sha,ROOT,GUARD};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
