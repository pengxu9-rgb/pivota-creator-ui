'use strict';
// Offline mutation runner. Scratch trees and all raw child logs stay outside Git.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),prefix='src/lib/pokemon/shopping/';
const edit=(file,from,to)=>({file:prefix+file,from,to});
const rows=[
 ['non_atomic_approval',[edit('ledger.cjs','// MUTATION:atomic_approval_publish -- no partial approval is ever made visible.','state=draft; // Deliberately publishes before the transaction can fail.')]],
 ['model_complete',[edit('facade.cjs','const recordKeys=',"tools.complete_checkout_session['x-callers'].push('model');\nconst recordKeys="),edit('facade.cjs',"!['get_operation','get_order'].includes(name)","!['get_operation','get_order','complete_checkout_session'].includes(name)"),edit('shoppingAdmission.cjs',"if(actor.role==='model'&&Object.values(task.operations)","if(actor.role==='model'&&name!=='complete_checkout_session'&&Object.values(task.operations)")]],
 ['payload_hash_in_key',[edit('ledger.cjs','task.id,name,args.request_id]','task.id,name,args.request_id,hash(semantic(args))]')]],
 ['unknown_resubmit',[edit('worker.cjs',"else if(op.status!=='queued')return;","else if(!['queued','unknown'].includes(op.status))return;")]],
 ['expiry_inclusive',[edit('shoppingAdmission.cjs','if(!(clock()<q.expires_at))','if(!(clock()<=q.expires_at))')]],
 ['ignore_cancellation_epoch',[edit('shoppingAdmission.cjs',"if(args.cancellation_epoch!==task.cancellation_epoch)fail('cancelled');","if(false)fail('cancelled');")]],
 ['jpy_times_100',[edit('evidence.cjs','JPY:0,USD:2','JPY:2,USD:2')]],
 ['persist_assumption',[edit('ledger.cjs','const snapshot=(principal,ref)=>copy(principalTask(principal,ref));',"const snapshot=(principal,ref)=>{const task=principalTask(principal,ref);if(!task.accepted)task.accepted={currency:'JPY',budget_basis:'item'};return copy(task);};")]],
 ['rewritten_native',[edit('exploration.cjs','// MUTATION:readonly_native_boundary -- nativeCall is a host test probe, never invoked.',"nativeCall?.(normalized.replace(/pikacu/gi,'Pikachu')); // Deliberate boundary violation.")]],
 ['negated_english',[edit('exploration.cjs',"if(noEn)return ['ja'];","if(noEn)return ['ja','en'];")]],
 ['model_recovery',[edit('facade.cjs','actor=auth.meta(principal);const contract=tools[name];',"actor=auth.meta(principal);if(actor.role==='model'&&name==='recover_operation'){principal=auth.issue(actor,'ui');actor=auth.meta(principal);}const contract=tools[name];")]],
 ['ignore_owner',[edit('ledger.cjs',"if(!task||task.owner!==scopeKey(meta))fail('scope_denied');","if(!task)fail('scope_denied');")]],
 ['render_stale',[edit('render.cjs',"if(!current(record,clock(),86400000))fail('stale_evidence','read_refresh');","if(false)fail('stale_evidence','read_refresh');")]],
 ['ignore_source_permission',[edit('evidence.cjs',"||o.source_permission!==true||","||false||")]],
 ['suppress_changed_terms',[edit('ledger.cjs',"status:quote.total_minor===null?'partial':changed?'terms_changed':'complete'","status:quote.total_minor===null?'partial':'complete'")]]
];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function networkAudits(text){return text.split('\n').filter(l=>l.startsWith('{"strict_network_guard_audit":')).map(l=>JSON.parse(l).strict_network_guard_audit);}
function main(out){assert.ok(out&&path.isAbsolute(out)&&!out.startsWith(root+path.sep));assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});const scratch=path.join(out,'scratch');fs.mkdirSync(scratch);for(const dir of ['src','tests'])fs.cpSync(path.join(root,dir),path.join(scratch,dir),{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');const results=[];
 for(const [id,edits] of rows){const originals=[];try{for(const e of edits){const file=path.join(scratch,e.file),source=fs.readFileSync(file,'utf8');assert.equal(source.split(e.from).length-1,1,id+': exact edit');originals.push([file,source]);fs.writeFileSync(file,source.replace(e.from,e.to));}const run=cp.spawnSync(process.execPath,['--test','--test-reporter=tap','tests/shopping-offline.test.cjs'],{cwd:scratch,env:{...process.env,NODE_OPTIONS:'--require='+path.join(scratch,'tests/helpers/strict-network-guard.cjs')},encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});const log=(run.stdout||'')+(run.stderr||''),logPath=path.join(out,id+'.log');fs.writeFileSync(logPath,log);const audits=networkAudits(run.stderr||''),assertion=log.includes('ERR_ASSERTION'),killed=run.status===1&&!run.error&&assertion&&audits.length>=2&&audits.every(a=>a.count===0);const record={id,killed,exit_code:run.status,assertion,network_attempts:audits.reduce((n,a)=>n+a.count,0),guarded_processes:audits.length,log:{file:id+'.log',bytes:Buffer.byteLength(log),sha256:sha(log)},edits:edits.map(e=>({file:e.file,from:e.from,to:e.to}))};results.push(record);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({total:rows.length,killed:results.filter(r=>r.killed).length,rows:results},null,2)+'\n');assert.equal(killed,true,JSON.stringify(record));}finally{for(const [file,source] of originals.reverse())fs.writeFileSync(file,source);}}
 fs.rmSync(scratch,{recursive:true});process.stdout.write(JSON.stringify({total:rows.length,killed:results.length,network_attempts:0})+'\n');return results;
}
if(require.main===module)try{main(process.argv[2]);}catch(e){process.stderr.write(e.stack+'\n');process.exitCode=1;}
module.exports={rows,main};
