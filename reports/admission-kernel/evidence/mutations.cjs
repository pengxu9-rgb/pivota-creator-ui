'use strict';
require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),destination=path.join(root,'reports/admission-kernel/mutations');
const testFiles=['tests/admission-generated.test.cjs','tests/admission-adapter.test.cjs','tests/admission-architecture.test.cjs','tests/admission-kernel.test.cjs'];
const guardNames=['brand','scope_binding','deadline','commerce_hold','commerce_subject','card_binding','language_complete','ambiguous_currency','identity_complete','commercial_complete','intent_complete','local_control','reply_binding','held_language','held_task','native_echo'];
function removeCondition(source,name){
  if(name==='reply_binding'){
    const original='const isNarrowReply=(NARROW_REPLY.test(raw)||boundSet)&&!signals.money&&!signals.grade&&(!signals.identity||boundCoordinate||boundSet);';
    assert.ok(source.includes(original),'missing reply binding mutation target');
    return source.replace(original,'const isNarrowReply=(NARROW_REPLY.test(raw)||boundSet)&&!signals.money&&!signals.grade;');
  }
  const marker='// RULE:'+name,at=source.indexOf(marker);assert.ok(at>=0,'missing mutation target '+marker);
  const start=source.indexOf('if(',at+marker.length);assert.ok(start>=0,'missing guard condition '+name);
  let depth=1,end=start+3;
  for(;depth&&end<source.length;end++){if(source[end]==='(')depth++;else if(source[end]===')')depth--;}
  assert.equal(depth,0,'unterminated guard condition '+name);
  return source.slice(0,start)+'if(false)'+source.slice(end);
}
function run(directory,file){
  const guard=path.join(directory,'tests/helpers/strict-network-guard.cjs');
  const value=cp.spawnSync(process.execPath,['--require',guard,'--test',file],{cwd:directory,encoding:'utf8',timeout:60000,env:{...process.env,NODE_OPTIONS:'--require '+guard}});
  return {exit_code:value.status,signal:value.signal,error:value.error?.message||null,stdout:value.stdout,stderr:value.stderr};
}
function replaceExactly(source,from,to){assert.ok(source.includes(from),'missing mutation target '+from);assert.equal(source.indexOf(from),source.lastIndexOf(from),'nonunique mutation target '+from);return source.replace(from,to);}
const semanticMutants=[
  {id:'remove_money_signal_oracle',file:'src/lib/pokemon/admission.cjs',rule:'independent money signal detection',mutate:source=>{
    const start=source.indexOf('money:MONEY.test(text)'),end=source.indexOf(',grade:GRADE.test(text)',start);assert.ok(start>=0&&end>start);return source.slice(0,start)+'money:false'+source.slice(end);
  }},
  {id:'remove_grade_signal_oracle',file:'src/lib/pokemon/admission.cjs',rule:'independent grade signal detection',mutate:source=>replaceExactly(source,'grade:GRADE.test(text)','grade:false')},
  {id:'remove_broad_language_detection',file:'src/lib/pokemon/admission.cjs',rule:'unsupported language words must be detected',mutate:source=>{
    const start=source.indexOf('const LANGUAGE_SOURCE='),end=source.indexOf('\n',start);assert.ok(start>=0&&end>start);return source.slice(0,start)+"const LANGUAGE_SOURCE='English|Japanese|英語|英文|英版|日本語|日文|日版';"+source.slice(end);
  }},
  {id:'remove_set_signal_oracle',file:'src/lib/pokemon/admission.cjs',rule:'independent printed-set signal detection',mutate:source=>replaceExactly(source,'const sets=[...text.matchAll(SET)].map(m=>m[0]);','const sets=[];')},
  {id:'restore_generic_word_reply',file:'src/lib/pokemon/admission.cjs',rule:'generic words cannot bind an old catalog prompt',mutate:source=>{
    const start=source.indexOf('const NARROW_REPLY='),end=source.indexOf('\n',start),line=source.slice(start,end);
    assert.ok(line.includes('|\\d{1,3}'),'missing narrow reply grammar');return source.slice(0,start)+line.replace('|\\d{1,3}','|[A-Za-z0-9.-]{1,32}|\\d{1,3}')+source.slice(end);
  }},
  {id:'infer_ambiguous_currency_from_saved',file:'src/lib/pokemon/admission.cjs',rule:'ambiguous currency policy reversal (old saved-currency inference)',mutate:source=>{
    source=removeCondition(source,'ambiguous_currency');
    return replaceExactly(source,'if(/[$¥￥]/.test(text))return null;',"text=text.replace(/[$¥￥]/g,(current?.result?.preferences?.currency||'USD')+' ');");
  }},
  {id:'remove_single_use',file:'src/lib/pokemon/admission.cjs',rule:'plan single-use',mutate:source=>replaceExactly(source,"if(meta.used)fail('catalog_admission_consumed');",'')},
  {id:'remove_typed_preference_values',file:'src/lib/pokemon/admission.cjs',rule:'typed preference value validation',mutate:source=>{
    const start=source.indexOf('function validPreferences('),end=source.indexOf('\nfunction typedAction(',start);assert.ok(start>=0&&end>start);return source.slice(0,start)+'function validPreferences(p,current){return copy(p);}\n'+source.slice(end);
  }},
  {id:'remove_native_scope_echo',file:'src/lib/pokemon/admission.cjs',rule:'native scope echo',mutate:source=>{
    const start=source.indexOf('  for(const [key,value] of Object.entries(scope)){'),end=source.indexOf('  for(const [key,value] of Object.entries(preferences))',start);assert.ok(start>=0&&end>start);return source.slice(0,start)+source.slice(end);
  }},
  {id:'remove_native_preferences_echo',file:'src/lib/pokemon/admission.cjs',rule:'native preference echo',mutate:source=>replaceExactly(source,'for(const [key,value] of Object.entries(preferences))if(JSON.stringify(result.preferences?.[key])!==JSON.stringify(value))mismatch();','')},
  {id:'remove_native_record_echo',file:'src/lib/pokemon/admission.cjs',rule:'native server-record ID echo',mutate:source=>{
    const start=source.indexOf('  if(plan.constraints.recordIds?.length){'),end=source.indexOf('  return true;',start);assert.ok(start>=0&&end>start);return source.slice(0,start)+source.slice(end);
  }},
  {id:'remove_prepublication_echo',file:'src/lib/pokemon/catalogAdapter.cjs',rule:'native echo before workspace persistence',mutate:source=>replaceExactly(source,'nativeEcho(plan,result);','void result;')},
  {id:'remove_plan_freeze',file:'src/lib/pokemon/admission.cjs',rule:'plan immutability',kill_kind:'frozen-plan assertion contract (a mutable capability also permits authority modification)',mutate:source=>replaceExactly(source,'const plan=freeze(copy(value));','const plan=copy(value);')},
];
function copyTree(id){
  const directory=path.join(destination,id);fs.rmSync(directory,{recursive:true,force:true});fs.mkdirSync(directory,{recursive:true});
  for(const name of ['src','tests'])fs.cpSync(path.join(root,name),path.join(directory,name),{recursive:true});
  fs.mkdirSync(path.join(directory,'reports/admission-kernel'),{recursive:true});
  fs.cpSync(path.join(root,'reports/admission-kernel/evidence'),path.join(directory,'reports/admission-kernel/evidence'),{recursive:true});
  fs.symlinkSync(fs.realpathSync(path.join(root,'node_modules')),path.join(directory,'node_modules'),'dir');
  return directory;
}
function runAll(directory,id){
  const results={};
  for(const file of testFiles){
    const value=run(directory,file),log=path.join(destination,id,path.basename(file)+'.log');
    fs.writeFileSync(log,value.stdout+value.stderr);
    const audits=(value.stdout+'\n'+value.stderr).split('\n').map(line=>{try{return JSON.parse(line.replace(/^# /,''));}catch{return null;}}).filter(item=>item?.strict_network_guard_audit).map(item=>item.strict_network_guard_audit);
    assert.ok(audits.length,'missing worker network audit '+id+'/'+file);
    assert.ok(audits.every(item=>item.count===0),'network attempt during mutation '+id+'/'+file);
    results[file]={exit_code:value.exit_code,signal:value.signal,error:value.error,network_audits:audits,log:path.relative(root,log)};
  }
  // Retain logs and exact exit codes; scratch source copies are reproducible
  // from this script and must not bloat the review commit.
  for(const name of ['src','tests','reports','node_modules'])fs.rmSync(path.join(directory,name),{recursive:true,force:true});
  return results;
}
fs.mkdirSync(destination,{recursive:true});
const baselineDirectory=copyTree('baseline'),baseline=runAll(baselineDirectory,'baseline');
assert.ok(Object.values(baseline).every(value=>value.exit_code===0),'baseline must pass before mutation: '+JSON.stringify(baseline));
const rows=[];
for(const name of guardNames){
  const id='remove_'+name,directory=copyTree(id),file=path.join(directory,'src/lib/pokemon/admission.cjs');
  let source=removeCondition(fs.readFileSync(file,'utf8'),name);
  if(name==='ambiguous_currency'){
    // This rule is also checked by the positive preference compiler. Remove
    // both instances of the same rule, rather than report a duplicate defense
    // as a surviving semantic mutant.
    const duplicate='if(/[$¥￥]/.test(text))return null;';assert.ok(source.includes(duplicate));source=source.replace(duplicate,'');
  }
  fs.writeFileSync(file,source);
  // A syntax-invalid mutation is not evidence of a killed admission rule.
  const check=cp.spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
  const results=runAll(directory,id),killed=Object.values(results).some(value=>value.exit_code!==0);
  rows.push({mutant:id,changed_rule:name,changed_locations:[{file:'src/lib/pokemon/admission.cjs',rule_marker:'RULE:'+name},...(name==='ambiguous_currency'?[{file:'src/lib/pokemon/admission.cjs',duplicate_compiler_guard:'if(/[$¥￥]/.test(text))return null;'}]:[])],kill_kind:name==='ambiguous_currency'?'clarification contract kill; generic compiler still prevents authority loss':name==='intent_complete'?'compound-clarification contract kill; local-control/refine guards still prevent authority loss':'rule-removal conformance assertion',syntax_exit_code:check.status,results,killed});
}
for(const mutant of semanticMutants){
  const directory=copyTree(mutant.id),file=path.join(directory,mutant.file),source=fs.readFileSync(file,'utf8');fs.writeFileSync(file,mutant.mutate(source));
  const check=cp.spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);
  const results=runAll(directory,mutant.id);rows.push({mutant:mutant.id,changed_rule:mutant.rule,changed_locations:[{file:mutant.file,transform:mutant.mutate.toString()}],kill_kind:mutant.kill_kind||'semantic guard conformance assertion',syntax_exit_code:check.status,results,killed:Object.values(results).some(value=>value.exit_code!==0)});
}
for(const [id,source] of [['workspace_bypass',"module.exports=async (workspace,context,payload)=>workspace.advance(context,payload);\n"],['client_import_bypass',"const {createCollectorClient}=require('./vendor/collectorClient.cjs'); module.exports=createCollectorClient;\n"]]){
  const directory=copyTree(id);fs.writeFileSync(path.join(directory,'src/lib/pokemon/unauthorized-bypass.cjs'),source);
  const results=runAll(directory,id);rows.push({mutant:id,changed_rule:'single_facade',syntax_exit_code:0,results,killed:Object.values(results).some(value=>value.exit_code!==0)});
}
const output={schema:'pot.admission.mutations.v1',source_head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),baseline,test_files:testFiles,rows,historical_equivalence_audit:'reports/admission-kernel/mutations-initial-1af5966.json',network_attempts:require('../../../tests/helpers/strict-network-guard.cjs').attempts.length};
fs.writeFileSync(path.join(root,'reports/admission-kernel/mutations.json'),JSON.stringify(output,null,2)+'\n');
const heading='| Mutant | '+testFiles.map(file=>path.basename(file)).join(' | ')+' | Killed |\n| --- | '+testFiles.map(()=> '---').join(' | ')+' | --- |\n';
fs.writeFileSync(path.join(root,'reports/admission-kernel/mutation-table.md'),heading+rows.map(row=>'| '+row.mutant+' | '+testFiles.map(file=>String(row.results[file].exit_code)).join(' | ')+' | '+row.killed+' |').join('\n')+'\n\nThe ambiguous-currency deletion is a clarification-contract kill: the narrow compiler still prevents authority loss. The saved-currency policy-reversal negative control tests the actual unsafe inference. Initial equivalent-deletion evidence, including all-zero exit codes at 1af5966, is preserved in mutations-initial-1af5966.json.\n');
console.log(JSON.stringify({mutants:rows.length,killed:rows.filter(row=>row.killed).length,network_attempts:output.network_attempts}));
assert.equal(output.network_attempts,0);assert.ok(rows.every(row=>row.killed),'surviving mutants: '+rows.filter(row=>!row.killed).map(row=>row.mutant).join(','));
