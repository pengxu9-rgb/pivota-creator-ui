'use strict';
const guardState=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {run:runWorker,suite,copySnapshot,manifest,sha,ROOT}=require('./second-line-mutations.cjs');
const destination=path.join(ROOT,'reports/admission-kernel-round2/legacy-mutations');
const guardNames=['brand','scope_binding','deadline','commerce_hold','commerce_subject','card_binding','language_complete','ambiguous_currency','identity_complete','commercial_complete','intent_complete','local_control','reply_binding','held_language','held_task','native_echo'];
function removeCondition(source,name){
  if(name==='reply_binding'){
    const original='const isNarrowReply=(NARROW_REPLY.test(raw)||boundSet||boundNative)&&!signals.money&&!signals.grade&&(!signals.identity||boundCoordinate||boundSet||boundNative);';
    assert.ok(source.includes(original),'missing reply binding mutation target');
    return source.replace(original,'const isNarrowReply=(NARROW_REPLY.test(raw)||boundSet||boundNative)&&!signals.money&&!signals.grade;');
  }
  const marker='// RULE:'+name,at=source.indexOf(marker);assert.ok(at>=0,'missing mutation target '+marker);
  const start=source.indexOf('if(',at+marker.length);assert.ok(start>=0,'missing guard condition '+name);
  let depth=1,end=start+3;
  for(;depth&&end<source.length;end++){if(source[end]==='(')depth++;else if(source[end]===')')depth--;}
  assert.equal(depth,0,'unterminated guard condition '+name);
  return source.slice(0,start)+'if(false)'+source.slice(end);
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
const round2Mutants=[
  {id:'remove_nfkc_boundary',file:'src/lib/pokemon/admission.cjs',rule:'NFKC boundary shared by every detector, grammar and native question',
    mutate:source=>replaceExactly(source,"const normalize=text=>text.normalize('NFKC');",'const normalize=text=>text;')},
  {id:'remove_finish_signal_oracle',file:'src/lib/pokemon/admission.cjs',rule:'native finish signal oracle',
    mutate:source=>replaceExactly(source,'const parsed=mentions(text);','const parsed={...mentions(text),finishes:[]};')},
  {id:'remove_release_signal_oracle',file:'src/lib/pokemon/admission.cjs',rule:'native release signal oracle',
    mutate:source=>replaceExactly(source,'const parsed=mentions(text);','const parsed={...mentions(text),releases:[]};')},
  {id:'remove_bare_amount_word_completion',file:'src/lib/pokemon/admission.cjs',rule:'bare numbers, comparison words and raw/grade vocabulary complete the commercial detector',mutate:source=>{
    source=replaceExactly(source,String.raw`||bareNumber(text)||/≤|<|\b(?:or less|or under|tops|within|cheaper)\b/i.test(text)`,'');
    return replaceExactly(source,String.raw`||/\b(?:slabs?|raw|ungraded|mint)\b/i.test(text)`,'');
  }},
  {id:'remove_native_echo_complete',file:'src/lib/pokemon/admission.cjs',rule:'two-sided native language and scope echo',mutate:source=>removeCondition(source,'native_echo_complete')},
];
const originalFiles=['tests/admission-generated.test.cjs','tests/admission-adapter.test.cjs','tests/admission-architecture.test.cjs','tests/admission-kernel.test.cjs'];
const round2Files=['tests/admission-parity.test.cjs','tests/admission-second-line.test.cjs'];
// If a new defense renders a historical deletion redundant, establish and
// document that reason before adding it here. An unexplained survivor fails.
const equivalentReasons={};
function definitions(){
  const guards=guardNames.map(name=>({id:'remove_'+name,file:'src/lib/pokemon/admission.cjs',rule:name,
    kill_kind:name==='ambiguous_currency'?'clarification contract; positive compiler still limits authority':name==='intent_complete'?'compound clarification contract; other guards still limit authority':'rule-removal conformance assertion',
    mutate:source=>{
      source=removeCondition(source,name);
      if(name==='ambiguous_currency')source=replaceExactly(source,'if(/[$¥￥]/.test(text))return null;','');
      return source;
    }}));
  const bypasses=[
    {id:'workspace_bypass',file:'src/lib/pokemon/unauthorized-bypass.cjs',rule:'single_facade',mutate:()=>"module.exports=async (workspace,context,payload)=>workspace.advance(context,payload);\n"},
    {id:'client_import_bypass',file:'src/lib/pokemon/unauthorized-bypass.cjs',rule:'single_facade',mutate:()=>"const {createCollectorClient}=require('./vendor/collectorClient.cjs'); module.exports=createCollectorClient;\n"},
  ];
  const original=[...guards,...semanticMutants,...bypasses];assert.equal(original.length,31);
  return [...original.map(mutant=>({...mutant,group:'legacy31',test_files:mutant.id==='remove_set_signal_oracle'?[...originalFiles,'tests/admission-second-line.test.cjs']:originalFiles})),
    ...round2Mutants.map(mutant=>({...mutant,group:'round2_semantics',test_files:round2Files}))];
}
function table(output){
  const files=output.test_files,header='| Mutant | '+files.map(file=>path.basename(file)).join(' | ')+' | Outcome |\n| --- | '+files.map(()=> '---').join(' | ')+' | --- |\n';
  const rows=output.rows.map(row=>'| '+row.mutant+' | '+files.map(file=>row.results[file]?String(row.results[file].exit_code):'—').join(' | ')+' | '+(row.killed?'killed':row.equivalent_reason?'equivalent':'SURVIVED')+' |').join('\n');
  const equivalents=output.rows.filter(row=>row.equivalent_reason).map(row=>'- `'+row.mutant+'`: '+row.equivalent_reason).join('\n');
  fs.writeFileSync(path.join(ROOT,'reports/admission-kernel-round2/legacy-mutation-table.md'),header+rows+'\n\nA dash means that file was not run for that row. Original31 rows reproduce the original four-file gate. The set-signal deletion additionally runs the direct unknown-code test in the second-line file because pinned release names now independently detect known codes. New semantic rows run the parity and second-line files. The union of six files passes once as the baseline. Syntax is checked separately for every mutant. All worker audits have zero network attempts.\n\n'+equivalents+'\n');
}
async function main(){
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pot-admission-round2-legacy-mutants-')),snapshot=path.join(scratch,'snapshot');
  const output={schema:'pot.admission.legacy-and-round2-mutations.v2',source_head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    historical_harness:'reports/admission-kernel/evidence/mutations.cjs',historical_harness_sha256:sha(fs.readFileSync(path.join(ROOT,'reports/admission-kernel/evidence/mutations.cjs'))),
    historical_equivalence_audit:'reports/admission-kernel/mutations-initial-1af5966.json',test_files:[...originalFiles,...round2Files],source_manifest:[],baseline:null,rows:[]};
  const write=()=>fs.writeFileSync(path.join(ROOT,'reports/admission-kernel-round2/legacy-mutations.json'),JSON.stringify(output,null,2)+'\n');
  fs.mkdirSync(destination,{recursive:true});
  try {
    copySnapshot(ROOT,snapshot);output.source_manifest=manifest(snapshot);
    output.baseline=await suite(snapshot,'baseline',output.test_files,destination);write();
    assert.ok(Object.values(output.baseline).every(value=>value.exit_code===0),'legacy baseline must pass');
    console.log(JSON.stringify({phase:'legacy_baseline',files:output.test_files.length,network_attempts:0}));
    for(const mutant of definitions()){
      const directory=path.join(scratch,mutant.id);copySnapshot(snapshot,directory);
      try {
        const file=path.join(directory,mutant.file),source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'',changed=mutant.mutate(source);fs.writeFileSync(file,changed);
        const syntax=await runWorker(directory,['--check',file],path.join(destination,mutant.id,'syntax.log'));
        assert.equal(syntax.exit_code,0,'syntax-invalid mutant cannot count as killed: '+mutant.id);
        const results=await suite(directory,mutant.id,mutant.test_files,destination),failing=mutant.test_files.filter(file=>results[file].exit_code!==0);
        output.rows.push({mutant:mutant.id,group:mutant.group,file:mutant.file,changed_rule:mutant.rule,
          original_sha256:sha(source),mutant_sha256:sha(changed),transform:mutant.mutate.toString(),syntax,
          kill_kind:mutant.kill_kind||'semantic guard conformance assertion',results,killed:failing.length>0,failing_files:failing,
          ...(!failing.length&&equivalentReasons[mutant.id]?{equivalent_reason:equivalentReasons[mutant.id]}:{})});
        write();table(output);console.log(JSON.stringify({mutant:mutant.id,killed:failing.length>0,failing_files:failing,network_attempts:0}));
      }finally{fs.rmSync(directory,{recursive:true,force:true});}
    }
    output.network_attempts=guardState.attempts.length;
    output.network_audit_count=Object.values(output.baseline).reduce((n,row)=>n+row.network_audits.length,0)+
      output.rows.reduce((n,row)=>n+row.syntax.network_audits.length+Object.values(row.results).reduce((v,cell)=>v+cell.network_audits.length,0),0);
    assert.equal(output.network_attempts,0);
    const unexplained=output.rows.filter(row=>!row.killed&&!row.equivalent_reason);assert.deepEqual(unexplained.map(row=>row.mutant),[],'unexplained surviving mutants');
    output.complete=true;
  }finally{fs.rmSync(scratch,{recursive:true,force:true});output.scratch_cleaned=!fs.existsSync(scratch);write();}
  console.log(JSON.stringify({mutants:output.rows.length,killed:output.rows.filter(row=>row.killed).length,equivalent:output.rows.filter(row=>!row.killed).length,
    network_attempts:output.network_attempts,network_audit_count:output.network_audit_count,scratch_cleaned:output.scratch_cleaned}));
  return output;
}
module.exports={main,definitions,removeCondition,round2Mutants};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
