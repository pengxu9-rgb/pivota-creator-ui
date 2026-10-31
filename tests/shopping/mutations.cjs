'use strict';
// Offline mutation runner. Scratch trees and raw child logs stay outside Git.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),prefix='src/lib/pokemon/shopping/';
const edit=(file,from,to)=>({file:prefix+file,from,to});
const row=(id,target,edits)=>({id,target_test:'shopping: '+target,edits});
const rows=[
 row('non_atomic_approval','failed transaction exposes neither approval, reservation nor outbox',[
  edit('ledger.cjs','admission.validate(plan,original,{consume:true});beforeCommit({name,task:copy(task)});','state=draft;admission.validate(plan,original,{consume:true});beforeCommit({name,task:copy(task)});')
 ]),
 row('model_complete','valid approvals do not confer model execution, payment, case or recovery capabilities',[
  edit('facade.cjs','const recordKeys=',"tools.complete_checkout_session['x-callers'].push('model');\nconst recordKeys="),
  edit('facade.cjs',"!['get_operation','get_order'].includes(name)","!['get_operation','get_order','complete_checkout_session'].includes(name)"),
  edit('shoppingAdmission.cjs',"if(actor.role==='model'&&Object.values(task.operations)","if(actor.role==='model'&&name!=='complete_checkout_session'&&Object.values(task.operations)")
 ]),
 row('payload_hash_in_key','two same-key approvals reserve and dispatch once; changed payload conflicts',[
  edit('ledger.cjs','task.id,name,args.request_id]','task.id,name,args.request_id,hash(semantic(args))]')
 ]),
 row('unknown_resubmit','unknown outcome cannot be replaced or resubmitted by chat, UI or ordinary worker dispatch',[
  edit('worker.cjs',"else if(op.status!=='queued')return;","else if(!['queued','unknown'].includes(op.status))return;")
 ]),
 row('expiry_inclusive','admission alone enforces strict expiry and cancellation epoch',[
  edit('shoppingAdmission.cjs','if(!(clock()<q.expires_at))','if(!(clock()<=q.expires_at))')
 ]),
 row('ignore_cancellation_epoch','admission alone enforces strict expiry and cancellation epoch',[
  edit('shoppingAdmission.cjs',"if(args.cancellation_epoch!==task.cancellation_epoch)fail('cancelled');","if(false)fail('cancelled');")
 ]),
 row('jpy_times_100','money uses integer strings with JPY exponent zero and USD exponent two',[
  edit('evidence.cjs','JPY:0,USD:2','JPY:2,USD:2')
 ]),
 row('persist_assumption','both frozen arms complete all eighty episodes, twelve adversaries and six faults',[
  edit('ledger.cjs','const snapshot=(principal,ref)=>copy(principalTask(principal,ref));',"const snapshot=(principal,ref)=>{const task=principalTask(principal,ref);if(!task.accepted)task.accepted={currency:'JPY',budget_basis:'item'};return copy(task);};")
 ]),
 row('rewritten_native','read exploration neither binds assumptions nor rewrites native text',[
  edit('exploration.cjs','// MUTATION:readonly_native_boundary -- nativeCall is a host test probe, never invoked.',"nativeCall?.(normalized.replace(/pikacu/gi,'Pikachu')); // Deliberate boundary violation.")
 ]),
 row('negated_english','negated English cannot be returned even with an explicit English printing ref',[
  edit('exploration.cjs',"if(noEn)return ['ja'];","if(noEn)return ['ja','en'];")
 ]),
 row('model_recovery','inconclusive lookup remains unknown; only trusted recovery schedules another lookup',[
  edit('facade.cjs','actor=auth.meta(principal);const contract=tools[name];',"actor=auth.meta(principal);if(actor.role==='model'&&name==='recover_operation'){principal=auth.issue(actor,'ui');actor=auth.meta(principal);}const contract=tools[name];")
 ]),
 row('ignore_owner','cross-app refs and cross-user reads reveal no task or evidence',[
  edit('ledger.cjs',"if(!task||task.owner!==scopeKey(meta))fail('scope_denied');","if(!task)fail('scope_denied');")
 ]),
 row('render_stale','renderer rejects missing, injected, superseded and expired evidence',[
  edit('render.cjs',"if(!current(record,clock(),86400000))fail('stale_evidence','read_refresh');","if(false)fail('stale_evidence','read_refresh');")
 ]),
 row('ignore_source_permission','source permission, lot, grade, finish and stale observations qualify independently',[
  edit('evidence.cjs',"||o.source_permission!==true||","||false||")
 ]),
 row('suppress_changed_terms','both frozen arms complete all eighty episodes, twelve adversaries and six faults',[
  edit('ledger.cjs',"status:quote.total_minor===null?'partial':changed?'terms_changed':'complete'","status:quote.total_minor===null?'partial':'complete'")
 ])
];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function networkAudits(text){
 return text.split('\n').flatMap(line=>{
  const clean=line.replace(/^#\s*/, '');
  if(!clean.startsWith('{"strict_network_guard_audit":'))return [];
  return [JSON.parse(clean).strict_network_guard_audit];
 });
}
function failures(stdout){
 const result=[];let active=null;
 for(const line of stdout.split('\n')){
  const start=line.match(/^not ok \d+ - (.+)$/);
  if(start){if(active)result.push(active);active={name:start[1],lines:[]};continue;}
  if(active&&/^(?:# Subtest:|ok \d+ - |1\.\.)/.test(line)){result.push(active);active=null;}
  if(active)active.lines.push(line);
 }
 if(active)result.push(active);
 return result.map(({name,lines})=>{const body=lines.join('\n'),code=body.match(/^\s+code:\s*['"]?([^'"\s]+)/m)?.[1]||null;return {name,code,forbidden_error:/\b(?:internal_error|ReferenceError|SyntaxError)\b/.test(body),reason:body.trim()};});
}
// Require every changed module and statically reject unbound names as well.
// Loading alone would miss an out-of-scope identifier inside an uncalled closure.
const precheckSource=String.raw`
'use strict';
const path=require('node:path'),ts=require('typescript'),files=JSON.parse(process.argv[1]).map(f=>path.resolve(f));
try{
 const program=ts.createProgram(files,{allowJs:true,checkJs:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,types:['node'],typeRoots:[path.resolve('node_modules/@types')]}),targets=new Set(files);
 const diagnostics=[...program.getSyntacticDiagnostics(),...program.getSemanticDiagnostics().filter(d=>[2304,2552,18004].includes(d.code))].filter(d=>d.file&&targets.has(path.resolve(d.file.fileName)));
 if(diagnostics.length)throw new ReferenceError(diagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));
 for(const file of files)require(file);
 process.stdout.write(JSON.stringify({shopping_mutation_precheck:{valid:true,loaded:files.length}})+'\n');
}catch(error){process.stderr.write(JSON.stringify({shopping_mutation_precheck:{valid:false,error:error.name,message:error.message}})+'\n');process.exitCode=2;}
`;
function runNode(scratch,args){return cp.spawnSync(process.execPath,args,{cwd:scratch,env:{...process.env,NODE_OPTIONS:'--require='+path.join(scratch,'tests/helpers/strict-network-guard.cjs')},encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});}
function keepLog(out,name,run){const log=(run.stdout||'')+'\n'+(run.stderr||'');fs.writeFileSync(path.join(out,name),log);return {file:name,bytes:Buffer.byteLength(log),sha256:sha(log)};}
function audited(run,minimum){const records=networkAudits((run.stdout||'')+'\n'+(run.stderr||''));return {valid:records.length>=minimum&&records.every(a=>a.count===0&&Array.isArray(a.attempts)&&a.attempts.length===0),records,attempts:records.reduce((n,a)=>n+a.count,0)};}
function main(out){
 assert.ok(out&&path.isAbsolute(out)&&!out.startsWith(root+path.sep));assert.equal(fs.existsSync(out),false);
 fs.mkdirSync(out,{recursive:true});const scratch=path.join(out,'scratch');fs.mkdirSync(scratch);
 for(const dir of ['src','tests'])fs.cpSync(path.join(root,dir),path.join(scratch,dir),{recursive:true});
 fs.symlinkSync(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
 const results=[];
 const save=()=>fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({total:rows.length,killed:results.filter(r=>r.killed).length,complete:results.length===rows.length&&results.every(r=>r.killed),rows:results},null,2)+'\n');
 for(const {id,target_test,edits} of rows){
  const originals=[];
  try{
   for(const e of edits){const file=path.join(scratch,e.file),source=fs.readFileSync(file,'utf8');assert.equal(source.split(e.from).length-1,1,id+': exact edit');originals.push([file,source]);fs.writeFileSync(file,source.replace(e.from,e.to));}
   const pre=runNode(scratch,['-e',precheckSource,JSON.stringify([...new Set(edits.map(e=>e.file))])]),preAudit=audited(pre,1),preLog=keepLog(out,id+'.precheck.log',pre);
   const record={id,target_test,killed:false,status:'invalid',exit_code:null,failure_reason:null,precheck:{exit_code:pre.status,signal:pre.signal,valid:pre.status===0&&!pre.error&&!pre.signal&&preAudit.valid,guarded_processes:preAudit.records.length,network_attempts:preAudit.attempts,log:preLog},network_attempts:preAudit.attempts,edits};
   if(!record.precheck.valid){record.failure_reason='Mutated-module load/scope or network-audit precheck failed; no tests run.';results.push(record);save();assert.fail(id+': invalid mutant precheck');}
   const run=runNode(scratch,['--test','--test-reporter=tap','tests/shopping-offline.test.cjs']),audit=audited(run,2),testFailures=failures(run.stdout||''),target=testFailures.find(f=>f.name===target_test);
   Object.assign(record,{exit_code:run.status,signal:run.signal,guarded_processes:audit.records.length,network_attempts:record.network_attempts+audit.attempts,log:keepLog(out,id+'.log',run),failures:testFailures,target_failure:target||null});
   const forbidden=testFailures.some(f=>f.forbidden_error);
   record.killed=run.status===1&&!run.error&&!run.signal&&audit.valid&&target?.code==='ERR_ASSERTION'&&!forbidden;
   if(record.killed){record.status='killed_by_target_assertion';record.failure_reason=target.reason;}
   else if(run.error||run.signal||!audit.valid||forbidden){record.status='invalid';record.failure_reason=forbidden?'A failing test contains internal_error, ReferenceError or SyntaxError.':'Runner or network-audit validity requirement failed.';}
   else{record.status='survived_target';record.failure_reason='Target test did not fail with ERR_ASSERTION: test gap.';}
   results.push(record);save();assert.equal(record.killed,true,id+': '+record.status+'; '+record.failure_reason);
  }finally{for(const [file,source] of originals.reverse())fs.writeFileSync(file,source);}
 }
 fs.rmSync(scratch,{recursive:true});process.stdout.write(JSON.stringify({total:rows.length,killed:results.length,network_attempts:0})+'\n');return results;
}
if(require.main===module)try{main(process.argv[2]);}catch(e){process.stderr.write(e.stack+'\n');process.exitCode=1;}
module.exports={rows,main,networkAudits,failures};
