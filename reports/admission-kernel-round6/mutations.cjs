'use strict';
// Portable fresh gate. Usage: node reports/admission-kernel-round6/mutations.cjs
// <external-output-directory> <expected-40-character-head>. No archive is read.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ROOT=fs.realpathSync(path.resolve(__dirname,'../..'));
const GUARD=path.join(ROOT,'tests/helpers/strict-network-guard.cjs');
const guard=require(GUARD),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const hash=file=>sha(fs.readFileSync(file));
const git=(...args)=>cp.execFileSync('git',args,{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024}).trim();
const PYTHON_HELPER=path.join(__dirname,'python-guard.py');
const CONTEXT_FILE='tests/pokemon-private-context.test.cjs';
const ROUTING_FILE='tests/release-routing.test.cjs',ROUTING_PYTHON_WORKERS=51;
const once=(source,from,to)=>{assert.equal(source.split(from).length,2,'unique mutation target: '+from);return source.replace(from,()=>to);};
const R6=[
  {id:'R6_reply_collector_unanchored',from:"/^\\d{1,3}\\/[a-z0-9-]{1,32}$/u.test(value)",to:"/\\d{1,3}\\/[a-z0-9-]{1,32}$/u.test(value)"},
  {id:'R6_reply_set_unanchored',from:"new RegExp('^(?:'+SET.source+')$','i').test(value)",to:"new RegExp('(?:'+SET.source+')$','i').test(value)"},
  {id:'R6_reply_confirm_unanchored',from:"/^(?:yes|confirm|yes, that one|はい|确认|是)$/u.test(value)",to:"/(?:yes|confirm|yes, that one|はい|确认|是)$/u.test(value)"},
];
const EQUIVALENTS={
  remove_reply_binding:'The final whole-text reply boundary independently binds exact text and the current prompt. Removing its preliminary recognizer grants no additional reply authority.',
  restore_generic_word_reply:'The final exact bound-reply check remains. A bare-subject ask can become a safe hold; identical UI behavior is not claimed.',
  adapter_execute_runs_held_plans:'Every held plan is localOnly=true, so the retained check rejects it. Private frozen plan membership prevents changing that invariant.',
  R4_lucario_prefix:'The separate complete raw-text regex still controls explicitLegacySubject. Prefix matching inside catalogSyntax grants no additional literal ask authority.',
  R4_forms_case_sensitive_ex_only:'The whole catalogSyntax input is already folded before the regex captures the ASCII form. Removing the second toLowerCase changes no captured form.',
};
function definitions(){
  const prior=require('../admission-kernel-round5/evidence/mutations.cjs').definitions();
  assert.equal(prior.length,90);
  return [...prior,...R6.map(row=>({...row,file:'src/lib/pokemon/admission.cjs',group:'claude_round6',mutate:s=>once(s,row.from,row.to)}))];
}
function canonicalFuture(candidate){
  let current=path.resolve(candidate),tail=[];
  while(!fs.existsSync(current)){tail.unshift(path.basename(current));const parent=path.dirname(current);assert.notEqual(parent,current);current=parent;}
  return path.resolve(fs.realpathSync(current),...tail);
}
function within(parent,child){const relative=path.relative(parent,child);return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}
function external(candidate){
  assert.equal(within(ROOT,path.resolve(candidate)),false,'output path must be outside the repository');
  const resolved=canonicalFuture(candidate);
  assert.equal(within(ROOT,resolved),false,'output must be outside the repository');
  return resolved;
}
function freshDirectory(candidate){
  const directory=external(candidate);assert.equal(fs.existsSync(directory),false,'output must be new; preserve previous attempts');
  fs.mkdirSync(directory,{recursive:true});assert.equal(fs.realpathSync(directory),directory);return directory;
}
// Generate a PATH shim outside the repo; install Python denial before executing
// context probes or main's release-router subprocesses, then bind every receipt.
// This helper is reusable by the original/full-suite evidence runner.
function preparePythonShim(candidate){
  const directory=freshDirectory(candidate),audits=path.join(directory,'audits');fs.mkdirSync(audits);
  const found=cp.execFileSync('sh',['-c','command -v python3'],{encoding:'utf8'}).trim();
  assert.ok(found&&path.isAbsolute(found),'python3 must be available locally');const executable=fs.realpathSync(found);
  const quote=s=>"'"+s.replace(/'/g,"'\\''")+"'";
  const shell='#!/bin/sh\nexec '+[executable,'-I','-B',PYTHON_HELPER,audits].map(quote).join(' ')+' "$@"\n';
  fs.writeFileSync(path.join(directory,'python3'),shell,{mode:0o700});
  return {directory,audits,executable,helper_sha256:hash(PYTHON_HELPER),shell_sha256:sha(shell)};
}
const snapshotNames=['src','tests','cloud','public','scripts','.github','docs','private-coverage','package.json','tsconfig.json',
  'reports/admission-kernel/evidence','reports/admission-kernel-round2/evidence',
  'reports/admission-kernel-round3/evidence','reports/admission-kernel-round4/evidence',
  'reports/admission-kernel-round5/evidence'];
function snapshot(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const name of snapshotNames)if(fs.existsSync(path.join(from,name)))fs.cpSync(path.join(from,name),path.join(to,name),{recursive:true});
  fs.symlinkSync(fs.realpathSync(path.join(ROOT,'node_modules')),path.join(to,'node_modules'),'dir');
}
function manifest(directory){
  const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(entry=>{
    if(entry.name==='node_modules')return [];const full=path.join(dir,entry.name);
    return entry.isDirectory()?walk(full):[{file:path.relative(directory,full),sha256:hash(full)}];
  });return walk(directory);
}
const parseAudits=text=>text.split('\n').flatMap(line=>{
  try{const value=JSON.parse(line.replace(/^#\s*/,''));return value.strict_network_guard_audit?[value.strict_network_guard_audit]:[];}catch{return [];}
});
const counts=text=>Object.fromEntries(['tests','pass','fail','cancelled','skipped'].map(key=>[key,Number(text.match(new RegExp('(?:^|\\n)# '+key+' (\\d+)'))?.[1]||0)]));
const explicitAssertion=text=>/^\s+code: ['"]ERR_ASSERTION['"]/m.test(text);
function bindPython(shim,nodeAudits,cwd,programSha,expected,routingSha=null,expectedRouting=0){
  const pids=new Set(nodeAudits.map(a=>a.pid));
  const records=fs.readdirSync(shim.audits).filter(f=>f.endsWith('.json')).map(name=>{
    const file=path.join(shim.audits,name);return {audit_file:name,audit_sha256:hash(file),...JSON.parse(fs.readFileSync(file))};
  }).filter(record=>pids.has(record.ppid)&&
    (record.mode==='-c'?record.cwd===cwd:record.source_file===path.join(cwd,'scripts/release-routing.py')));
  assert.equal(records.length,expected+expectedRouting,'Python guard worker coverage');
  assert.equal(records.filter(record=>record.mode==='-c').length,expected,'context Python worker coverage');
  assert.equal(records.filter(record=>record.mode==='file').length,expectedRouting,'routing Python worker coverage');
  for(const record of records){
    if(record.mode==='-c'){assert.equal(record.cwd,cwd);assert.equal(record.program_sha256,programSha);}
    else{assert.equal(record.mode,'file');assert.equal(record.program_sha256,routingSha);assert.equal(record.source_file,path.join(cwd,'scripts/release-routing.py'));}
    assert.equal(record.count,0);assert.deepEqual(record.attempts,[]);
    assert.equal(record.installed_before_program_exec,true);assert.equal(record.audit_hook_installed,true);
    assert.equal(record.isolated,1);assert.equal(record.dont_write_bytecode,1);
  }return records;
}
function writeTable(out,output){
  const files=output.test_files,lines=[
    '| Mutant | '+files.map(f=>path.basename(f)).join(' | ')+' | Outcome |',
    '| --- | '+files.map(()=> '---').join(' | ')+' | --- |',
    ...output.rows.map(row=>'| '+row.mutant+' | '+files.map(file=>String(row.results[file].exit_code)).join(' | ')+' | '+(row.killed?'caught':row.equivalent_reason?'equivalent':'UNEXPLAINED SURVIVOR')+' |'),
    '', 'Each cell freshly executes the complete named test file at `'+output.source_head+'`; no subsets or retained cells. Every caught row needs an explicit ERR_ASSERTION failure. Contract exceptions, syntax errors, process failures, signals and timeouts cannot be sole kill evidence. All worker network audits must report zero attempts.',
    '',...output.rows.filter(r=>r.equivalent_reason||r.classification_reason).map(r=>'- `'+r.mutant+'`: '+(r.equivalent_reason||r.classification_reason))];
  fs.writeFileSync(path.join(out,'mutation-table.md'),lines.join('\n')+'\n');
}
async function main(candidate,expected){
  assert.match(expected||'',/^[a-f0-9]{40}$/,'expected exact head required');
  assert.equal(fs.realpathSync(git('rev-parse','--show-toplevel')),ROOT);
  assert.equal(git('rev-parse','HEAD'),expected);assert.equal(git('status','--porcelain'),'','run in a clean clone');
  assert.ok((process.env.NODE_OPTIONS||'').includes('--require='+GUARD),'strict guard must be preloaded and inherited');
  const out=freshDirectory(candidate),shim=preparePythonShim(path.join(out,'python-shim'));
  const program=fs.readFileSync(path.join(ROOT,CONTEXT_FILE),'utf8').match(/const program=String\.raw`([\s\S]*?)`;/)?.[1];assert.ok(program);
  const programSha=sha(program),routingSha=hash(path.join(ROOT,'scripts/release-routing.py')),all=definitions();assert.equal(all.length,93);assert.equal(new Set(all.map(m=>m.id)).size,93);
  const output={schema:'pot.admission.fresh93-mutations.v1',source_head:expected,method:'fresh full 93-by-43 sweep, no deltas or subsets',
    root:ROOT,guard:GUARD,harness_sha256:hash(__filename),python_shim:shim,context_program_sha256:programSha,routing_program_sha256:routingSha,
    started_at:new Date().toISOString(),max_test_workers:4,test_files:[],source_manifest:[],baseline:null,baseline_full_suite:null,
    rows:[],complete:false,scratch_cleaned:false,signals_sent_to_own_children:0,signals_sent_to_foreign_processes:0,resource_observations:[]};
  const write=()=>{const file=path.join(out,'mutations.json');fs.writeFileSync(file+'.tmp',JSON.stringify(output,null,2)+'\n');fs.renameSync(file+'.tmp',file);writeTable(out,output);};
  let active=0;
  const resourceTimer=setInterval(()=>output.resource_observations.push({time:new Date().toISOString(),load:os.loadavg(),logical_cpus:os.cpus().length,active_test_workers:active}),10000);
  function run(cwd,args,log,{minimumAudits=1,testFile=null,mutantHash=null,expectedPython=0,expectedRouting=0,limit=180000}={}){
    cwd=fs.realpathSync(cwd);
    return new Promise((resolve,reject)=>{
      const environment={...process.env,PATH:shim.directory+path.delimiter+process.env.PATH,NODE_OPTIONS:'--require='+GUARD};
      for(const name of Object.keys(environment))if(/^(?:https?|all)_proxy$/i.test(name))delete environment[name];
      const child=cp.spawn(process.execPath,args,{cwd,env:environment,stdio:['ignore','pipe','pipe']});active++;
      let stdout='',stderr='',error=null,timedOut=false;
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stdout.on('data',data=>stdout+=data);child.stderr.on('data',data=>stderr+=data);child.once('error',e=>error=e.message);
      // No process is signalled. A slow worker is allowed to finish, but its
      // deadline violation fails the gate and can never become kill evidence.
      const timer=setTimeout(()=>{timedOut=true;console.error(JSON.stringify({slow_worker:child.pid,args,limit}));},limit);
      child.once('close',(code,signal)=>{clearTimeout(timer);active--;try{
        fs.mkdirSync(path.dirname(log),{recursive:true});const raw=stdout+'\n'+stderr;fs.writeFileSync(log,raw);
        const audits=parseAudits(raw),python=bindPython(shim,audits,cwd,programSha,expectedPython,routingSha,expectedRouting);
        const cell={executed_head:expected,cwd,binary:process.execPath,args,child_pid:child.pid,exit_code:code,signal,error,timed_out:timedOut,
          network_audits:audits,python_network_audits:python,expected_python_workers:expectedPython+expectedRouting,expected_context_workers:expectedPython,expected_routing_workers:expectedRouting,test_counts:counts(stdout),
          log:path.relative(out,log),log_sha256:sha(raw),explicit_assertion:explicitAssertion(raw),
          ...(testFile?{test_sha256:hash(path.join(cwd,testFile))}:{}),...(mutantHash?{mutant_source_sha256:mutantHash}:{})};
        fs.writeFileSync(log+'.cell.json',JSON.stringify(cell,null,2)+'\n');
        assert.equal(signal,null,'worker signal');assert.equal(error,null,'worker spawn error');assert.equal(timedOut,false,'worker deadline');
        assert.ok(audits.length>=minimumAudits,'missing Node worker audits');
        for(const record of audits){assert.equal(record.count,0);assert.deepEqual(record.attempts,[]);}resolve(cell);
      }catch(e){reject(e);}});
    });
  }
  async function suite(directory,id,files,mutantHash){
    const queue=[...files],results={};
    const workers=await Promise.allSettled(Array.from({length:Math.min(4,files.length)},async()=>{
      while(queue.length){const file=queue.shift();results[file]=await run(directory,['--test','--test-reporter=tap',file],path.join(out,'logs',id,path.basename(file)+'.log'),{minimumAudits:2,testFile:file,mutantHash,expectedPython:file===CONTEXT_FILE?1:0,expectedRouting:file===ROUTING_FILE?ROUTING_PYTHON_WORKERS:0});}
    }));for(const value of workers)if(value.status==='rejected')throw value.reason;
    return Object.fromEntries(files.map(file=>[file,results[file]]));
  }
  const scratch=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'pot-admission-fresh93-'))),base=path.join(scratch,'snapshot');
  assert.equal(within(ROOT,scratch),false);output.scratch=scratch;
  try{
    snapshot(ROOT,base);output.source_manifest=manifest(base);
    output.test_files=fs.readdirSync(path.join(base,'tests')).filter(f=>f.endsWith('.test.cjs')).sort().map(f=>'tests/'+f);assert.equal(output.test_files.length,43);
    output.baseline_full_suite=await run(base,['--test','--test-concurrency=1','--test-reporter=tap',...output.test_files],path.join(out,'logs','baseline','full-suite.log'),{minimumAudits:44,limit:300000,expectedPython:1,expectedRouting:ROUTING_PYTHON_WORKERS});
    assert.equal(output.baseline_full_suite.exit_code,0,'baseline full suite');assert.equal(output.baseline_full_suite.test_counts.pass,475);
    output.baseline=await suite(base,'baseline',output.test_files);assert.ok(Object.values(output.baseline).every(c=>c.exit_code===0));write();
    console.log(JSON.stringify({phase:'baseline_passed',tests:output.baseline_full_suite.test_counts,files:43}));
    for(const mutant of all){
      assert.equal(git('rev-parse','HEAD'),expected);const directory=path.join(scratch,mutant.id);snapshot(base,directory);
      try{
        const file=path.join(directory,mutant.file),source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'',changed=mutant.mutate(source),mutantHash=sha(changed);fs.writeFileSync(file,changed);
        const syntax=await run(directory,['--check',file],path.join(out,'logs',mutant.id,'syntax.log'),{mutantHash});assert.equal(syntax.exit_code,0,'syntax '+mutant.id);
        const results=await suite(directory,mutant.id,output.test_files,mutantHash);
        const failing=output.test_files.filter(f=>results[f].exit_code!==0),assertionFiles=failing.filter(f=>results[f].explicit_assertion);
        for(const cell of Object.values(results))if(cell.exit_code!==0){assert.ok(cell.test_counts.fail>0);assert.equal(cell.test_counts.cancelled,0);}
        const row={mutant:mutant.id,group:mutant.group,file:mutant.file,changed_rule:mutant.rule||mutant.classification_reason||mutant.id,
          original_sha256:sha(source),mutant_sha256:mutantHash,
          transform:mutant.transformations?{operations:mutant.transformations}:mutant.from?{from:mutant.from,to:mutant.to}:mutant.mutate.toString(),
          syntax,results,killed:assertionFiles.length>0,failing_files:failing,explicit_assertion_files:assertionFiles,
          ...(mutant.historical_transform?{historical_transform:mutant.historical_transform,retarget_reason:mutant.retarget_reason}:{}),
          ...(mutant.stricter_only?{stricter_only:true,classification_reason:mutant.classification_reason}:{}),
          ...(!failing.length&&EQUIVALENTS[mutant.id]?{equivalent_reason:EQUIVALENTS[mutant.id]}:{})};
        output.rows.push(row);write();assert.ok(!failing.length||assertionFiles.length>0,'explicit assertion required '+mutant.id);
        console.log(JSON.stringify({mutant:mutant.id,killed:row.killed,assertion_files:assertionFiles,rows:output.rows.length,network_attempts:0}));
      }finally{fs.rmSync(directory,{recursive:true,force:true});}
    }
    assert.equal(output.rows.length,93);assert.equal(output.rows.filter(r=>r.killed).length,88);
    assert.deepEqual(output.rows.filter(r=>r.equivalent_reason).map(r=>r.mutant).sort(),Object.keys(EQUIVALENTS).sort());
    assert.deepEqual(output.rows.filter(r=>!r.killed&&!r.equivalent_reason).map(r=>r.mutant),[],'unexplained survivors');
    for(const {id} of R6)assert.ok(output.rows.find(r=>r.mutant===id).explicit_assertion_files.includes('tests/admission-round6.test.cjs'));
    const check=path.join(scratch,'input-check');snapshot(ROOT,check);assert.deepEqual(manifest(check),output.source_manifest);
    assert.equal(hash(__filename),output.harness_sha256);assert.equal(hash(PYTHON_HELPER),shim.helper_sha256);assert.equal(hash(path.join(shim.directory,'python3')),shim.shell_sha256);
    assert.equal(git('rev-parse','HEAD'),expected);assert.equal(git('status','--porcelain'),'');assert.equal(guard.attempts.length,0);assert.equal(active,0);output.complete=true;
  }catch(error){output.error={message:error.message,stack:error.stack};throw error;}finally{
    clearInterval(resourceTimer);fs.rmSync(scratch,{recursive:true,force:true});output.scratch_cleaned=!fs.existsSync(scratch);output.active_workers_after=active;output.finished_at=new Date().toISOString();
    const cells=[output.baseline_full_suite,...Object.values(output.baseline||{}),...output.rows.flatMap(r=>[r.syntax,...Object.values(r.results)])].filter(Boolean);
    output.network_attempts=guard.attempts.length;output.network_audit_count=cells.reduce((n,c)=>n+c.network_audits.length,0);
    output.python_network_audit_count=cells.reduce((n,c)=>n+c.python_network_audits.length,0);
    output.python_network_attempts=cells.reduce((n,c)=>n+c.python_network_audits.reduce((s,a)=>s+a.count,0),0);
    output.complete_test_file_cells_and_syntax_checks=cells.length;
    if(output.complete){assert.equal(output.python_network_audit_count,4940);assert.equal(cells.length,4136);
      assert.equal(fs.readdirSync(shim.audits).filter(f=>f.endsWith('.json')).length,4940,'unclaimed Python audit');}
    write();
  }
  console.log(JSON.stringify({complete:output.complete,head:expected,mutants:output.rows.length,caught:output.rows.filter(r=>r.killed).length,equivalent:output.rows.filter(r=>r.equivalent_reason).length,
    network_attempts:output.network_attempts,worker_audits:output.network_audit_count,python_audits:output.python_network_audit_count,scratch_cleaned:output.scratch_cleaned}));
  return output;
}
module.exports={ROOT,GUARD,definitions,preparePythonShim,external,manifest,snapshot,sha,hash,parseAudits,counts,bindPython,main};
if(require.main===module)main(process.argv[2],process.argv[3]).catch(error=>{console.error(error);process.exitCode=1;});
