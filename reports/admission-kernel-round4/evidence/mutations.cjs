'use strict';
// Round 4 reruns every historical transform and preserves the original subset
// gates. Claude's new review mutations and every new stored-goal rule deletion
// run every complete test file. No mutation touches the working checkout.
const guard=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const prior=require('../../admission-kernel-round3/evidence/second-line-mutations.cjs');
const legacy=require('../../admission-kernel-round3/evidence/legacy-mutations.cjs');
const round3=require('../../admission-kernel-round3/evidence/round3-mutations.cjs');
const {ROOT,GUARD,run,suite,manifest,sha}=prior;
const OUT=path.join(ROOT,'reports/admission-kernel-round4'),DEST=path.join(OUT,'mutation-logs');
const KE='src/lib/pokemon/admission.cjs';
const once=(s,from,to)=>{assert.equal(s.split(from).length,2,'unique mutation target: '+from);return s.replace(from,to);};
const equivalents={
  remove_reply_binding:'Safety/conformance equivalence retained from round 3: final whole-text reply check independently binds exact text and prompt. Deleting the earlier preliminary identity predicate grants no additional reply authority.',
  restore_generic_word_reply:'Safety/conformance equivalence retained from round 3: widening preliminary NARROW_REPLY cannot bypass the final exact bound-reply check. A bare subject may become a safe hold, so identical UI behavior is not claimed.',
  adapter_execute_runs_held_plans:'Held plans always have localOnly=true. The retained localOnly check rejects them; frozen private-membership plans cannot change that invariant.',
  R4_lucario_prefix:'Equivalent: the separate raw-text /^find lucario cards[?!.]*$/i gate must be exact before explicitLegacySubject is true. Prefix matching inside catalogSyntax therefore grants no additional ask authority.',
  R4_forms_case_sensitive_ex_only:'Equivalent in this implementation: catalogSyntax begins by fold(text), so the ASCII subject form captured by the regex is already lowercase, including original EX/Ex/full-width variants. Removing the final toLowerCase changes no captured form. The positive EX regression still pins admitted behavior. Claude described the transform as stricter-only; this earlier normalization makes that distinction unobservable here.',
};
function reviewDefinitions(){
  // These are the exact transforms in Claude's round-4 review. The metadata
  // anchor for prior identity can be relocated without changing its deletion.
  return [
    {id:'R4_allow_non_ex_forms',from:"||accepted?.identity?.form&&accepted.identity.form!=='ex')local('compound');",to:")local('compound');"},
    {id:'R4_reply_text_mismatch_allowed',from:"if(action.text!==raw||!boundNative",to:"if(!boundNative"},
    {id:'R4_reply_unbound_allowed',from:"||!boundNative&&!boundSet&&!boundCoordinate&&!confirmation)local('compound');",to:")local('compound');"},
    {id:'R4_confirmation_any_field',from:"&&/^(?:select|confirm)$/.test(field||'');",to:";"},
    {id:'R4_printed_set_any_token',from:"  if(printed&&!new RegExp('^(?:'+SET.source+')$','i').test(printed[1])&&\n    !signals.releases.some(hit=>hit.alias===printed[1]))return null;\n",to:"\n"},
    {id:'R4_valuable_card_prefix',from:"&&value!=='a valuable card'&&",to:"&&!value.startsWith('a valuable card')&&"},
    {id:'R4_lucario_prefix',from:"value==='lucario cards'",to:"value.startsWith('lucario cards')"},
    {id:'R4_language_only_any_text',from:"languageSignals(forwarded))?.answer===true;",to:"languageSignals(forwarded))?.answer!==false;"},
    {id:'R4_set_token_without_digit',from:"(?:\\\\s+[A-Z]{1,6}[0-9][A-Za-z0-9.-]{0,30})?",to:"(?:\\\\s+[A-Z]{1,6}[A-Za-z0-9.-]{0,30})?"},
    {id:'R4_subject_any_word',from:"new RegExp('^\\\\s+(?:'+POSITIVE_SUBJECT+'(?:\\\\s+",to:"new RegExp('^\\\\s+(?:\\\\S+(?:\\\\s+"},
    {id:'R4_drop_ask_grammar_branch',from:"      if(action.type==='ask'){\n        const forwarded",to:"      if(false){\n        const forwarded"},
    {id:'R4_drop_reply_grammar_branch',from:"      }else{\n        const confirmation",to:"      }else if(false){\n        const confirmation"},
    {id:'R4_residual_digit_ascii_only',from:"return /\\p{Nd}+/u.test(residual);",to:"return /[0-9]+/u.test(residual);"},
    {id:'R4_drop_prior_question_identity',from:"identity=catalogSyntax(previous,extractSignals(previous),language,null,",to:"identity=null&&catalogSyntax(previous,extractSignals(previous),language,null,"},
    {id:'R4_forms_case_sensitive_ex_only',from:"form:subject?.[2]?.toLowerCase()||null",to:"form:subject?.[2]||null"},
  ].map(row=>({...row,file:KE,group:'claude_round4',mutate:s=>once(s,row.from,row.to)}));
}
function definitions(){
  const original=legacy.definitions();
  assert.equal(original.length,36);
  return [...original,...prior.mutants.map(row=>({...row,group:'claude_second_line',mutate:s=>once(s,row.from,row.to)})),
    ...round3.definitions().map(row=>({...row,group:'round3_semantics'})),...reviewDefinitions(),
    ...require('./stored-goal-mutants.cjs').definitions()];
}
function snapshot(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const name of ['src','tests','cloud','public','package.json','tsconfig.json','reports/admission-kernel/evidence','reports/admission-kernel-round2/evidence','reports/admission-kernel-round3/evidence','reports/admission-kernel-round4/evidence']){
    if(fs.existsSync(path.join(from,name)))fs.cpSync(path.join(from,name),path.join(to,name),{recursive:true});
  }
  fs.symlinkSync(fs.realpathSync(path.join(ROOT,'node_modules')),path.join(to,'node_modules'),'dir');
}
function writeTable(output){
  const files=output.test_files,head='| Mutant | '+files.map(file=>path.basename(file)).join(' | ')+' | Outcome |\n| --- | '+files.map(()=> '---').join(' | ')+' | --- |\n';
  const rows=output.rows.map(row=>'| '+row.mutant+' | '+files.map(file=>row.results[file]?String(row.results[file].exit_code):'—').join(' | ')+' | '+(row.killed?(row.stricter_only?'caught (stricter only)':'caught'):'equivalent')+' |').join('\n');
  const notes=output.rows.filter(row=>row.equivalent_reason||row.classification_reason).map(row=>'- `'+row.mutant+'`: '+(row.equivalent_reason||row.classification_reason)).join('\n');
  fs.writeFileSync(path.join(OUT,'mutation-table.md'),head+rows+'\n\nEach number is the actual exit code for the complete named test file. A dash means not run. Original31 retain their prior subset gates; the five round2 rows retain their prior three-file gate. Every other historical row, every Claude round4 row and every new stored-goal mutant runs every final test file. Syntax checks must exit 0. A kill requires real assertion failures, not a timeout, signal, spawn error or syntax failure. Every worker audit must report zero network attempts.\n\n'+notes+'\n');
}
async function main(){
  const mutants=definitions();assert.equal(new Set(mutants.map(row=>row.id)).size,mutants.length);
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pot-admission-round4-mutants-')),base=path.join(scratch,'snapshot');
  const output={schema:'pot.admission.round4-mutations.v1',source_head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),guard:GUARD,
    scratch_outside_workspace:!scratch.startsWith(ROOT+path.sep),source_manifest:[],test_files:[],baseline:null,baseline_full_suite:null,rows:[]};
  fs.mkdirSync(OUT,{recursive:true});
  const write=()=>{fs.writeFileSync(path.join(OUT,'mutations.json'),JSON.stringify(output,null,2)+'\n');writeTable(output);};
  try {
    snapshot(ROOT,base);output.source_manifest=manifest(base);
    output.test_files=fs.readdirSync(path.join(base,'tests')).filter(f=>f.endsWith('.test.cjs')).sort().map(f=>'tests/'+f);
    output.baseline_full_suite=await run(base,['--test','--test-reporter=tap',...output.test_files],path.join(DEST,'baseline','full-suite.log'),{timeout:300000,minimumAudits:output.test_files.length+1});
    assert.equal(output.baseline_full_suite.exit_code,0,'baseline full suite');
    output.baseline=await suite(base,'baseline',output.test_files,DEST);write();
    assert.ok(Object.values(output.baseline).every(row=>row.exit_code===0),'baseline per-file suite');
    console.log(JSON.stringify({phase:'round4_baseline',files:output.test_files.length,counts:output.baseline_full_suite.test_counts,network_attempts:0}));
    for(const mutant of mutants){
      const directory=path.join(scratch,mutant.id);snapshot(base,directory);
      try {
        const full=path.join(directory,mutant.file),source=fs.existsSync(full)?fs.readFileSync(full,'utf8'):'',changed=mutant.mutate(source);fs.writeFileSync(full,changed);
        const syntax=await run(directory,['--check',full],path.join(DEST,mutant.id,'syntax.log'));assert.equal(syntax.exit_code,0,'syntax '+mutant.id);
        const files=mutant.test_files||output.test_files,results=await suite(directory,mutant.id,files,DEST);
        for(const [file,cell] of Object.entries(results)){
          assert.equal(cell.signal,null,'worker signal '+mutant.id+' '+file);assert.equal(cell.error,null,'worker spawn error');
          if(cell.exit_code!==0){assert.ok(cell.test_counts.fail>0,'non-assertion failure cannot count as killed '+mutant.id+' '+file);assert.equal(cell.test_counts.cancelled,0,'cancelled worker');}
        }
        const failing=files.filter(file=>results[file].exit_code!==0);
        output.rows.push({mutant:mutant.id,group:mutant.group,file:mutant.file,changed_rule:mutant.rule||mutant.classification_reason||mutant.id,
          original_sha256:sha(source),mutant_sha256:sha(changed),transform:mutant.from?{from:mutant.from,to:mutant.to}:mutant.mutate.toString(),syntax,
          ...(mutant.stricter_only?{stricter_only:true,classification_reason:mutant.classification_reason}:{}),results,killed:failing.length>0,failing_files:failing,
          ...(!failing.length&&(equivalents[mutant.id]||mutant.equivalent_reason)?{equivalent_reason:equivalents[mutant.id]||mutant.equivalent_reason}:{})});
        write();console.log(JSON.stringify({mutant:mutant.id,killed:failing.length>0,failing_files:failing,network_attempts:0}));
      }finally{fs.rmSync(directory,{recursive:true,force:true});}
    }
    output.network_attempts=guard.attempts.length;assert.equal(output.network_attempts,0);
    output.network_audit_count=output.baseline_full_suite.network_audits.length+Object.values(output.baseline).reduce((n,row)=>n+row.network_audits.length,0)+
      output.rows.reduce((n,row)=>n+row.syntax.network_audits.length+Object.values(row.results).reduce((v,cell)=>v+cell.network_audits.length,0),0);
    assert.equal(output.rows.length,mutants.length);assert.deepEqual(output.rows.filter(row=>!row.killed&&!row.equivalent_reason).map(row=>row.mutant),[],'unexplained survivors');
    output.groups=Object.fromEntries([...new Set(output.rows.map(r=>r.group))].map(group=>{const rows=output.rows.filter(r=>r.group===group);return [group,{mutants:rows.length,killed:rows.filter(r=>r.killed).length,equivalent:rows.filter(r=>!r.killed).length}];}));
    const verify=path.join(scratch,'verify');snapshot(ROOT,verify);assert.deepEqual(manifest(verify),output.source_manifest,'working source/test/input changed during sweep');
    output.complete=true;
  }finally{fs.rmSync(scratch,{recursive:true,force:true});output.scratch_cleaned=!fs.existsSync(scratch);write();}
  console.log(JSON.stringify({groups:output.groups,network_attempts:output.network_attempts,network_audit_count:output.network_audit_count,scratch_cleaned:output.scratch_cleaned,complete:output.complete}));
  return output;
}
module.exports={main,definitions,reviewDefinitions,snapshot,once};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
