'use strict';
// Round 5 preserves the 77 historical mutation IDs/subset gates, then adds
// Claude's seven review transforms and six new stored-replay/parity rules.
// All edits occur in external scratch copies, never in the worktree.
const guard=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const historical=require('../../admission-kernel-round4/evidence/mutations.cjs');
const {ROOT,GUARD,run,suite,manifest,sha}=require('../../admission-kernel-round3/evidence/second-line-mutations.cjs');
const OUT=path.join(ROOT,'reports/admission-kernel-round5'),DEST=path.join(OUT,'mutation-logs');
const once=(source,from,to)=>{assert.equal(source.split(from).length,2,'unique mutation target: '+from);return source.replace(from,()=>to);};
const equivalents={
  remove_reply_binding:'Safety/conformance equivalence retained from round 3: the final whole-text reply boundary independently binds exact text and the current prompt. Removing its preliminary recognizer grants no additional reply authority.',
  restore_generic_word_reply:'Safety/conformance equivalence retained from round 3: the final exact bound-reply check remains. A bare-subject ask can become a safe hold; identical UI behavior is not claimed.',
  adapter_execute_runs_held_plans:'Every held plan is also localOnly=true, so the retained check still rejects it. Private, frozen plan membership prevents changing that invariant.',
  R4_lucario_prefix:'The separate complete raw-text regex still controls explicitLegacySubject. Prefix matching inside catalogSyntax cannot grant any additional literal ask authority.',
  R4_forms_case_sensitive_ex_only:'The whole catalogSyntax input is already fold(text) before the regex captures the ASCII form. EX/Ex/full-width captures are therefore already lowercase; removing the second toLowerCase is equivalent.',
};
function definitions(){
  const old=historical.definitions();assert.equal(old.length,77);
  const {adaptHistorical,definitions:newDefinitions}=require('./round5-mutants.cjs');
  return [...old.map(adaptHistorical),...newDefinitions()];
}
function snapshot(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const name of ['src','tests','cloud','public','package.json','tsconfig.json','reports/admission-kernel/evidence','reports/admission-kernel-round2/evidence','reports/admission-kernel-round3/evidence','reports/admission-kernel-round4/evidence','reports/admission-kernel-round5/evidence']){
    if(fs.existsSync(path.join(from,name)))fs.cpSync(path.join(from,name),path.join(to,name),{recursive:true});
  }
  fs.symlinkSync(fs.realpathSync(path.join(ROOT,'node_modules')),path.join(to,'node_modules'),'dir');
}
function writeTable(output){
  const files=output.test_files,header='| Mutant | '+files.map(f=>path.basename(f)).join(' | ')+' | Outcome |\n| --- | '+files.map(()=> '---').join(' | ')+' | --- |\n';
  const rows=output.rows.map(row=>'| '+row.mutant+' | '+files.map(f=>row.results[f]?String(row.results[f].exit_code):'—').join(' | ')+' | '+(row.killed?(row.stricter_only?'caught (stricter only)':'caught'):row.equivalent_reason?'equivalent':'UNEXPLAINED SURVIVOR')+' |').join('\n');
  const notes=output.rows.filter(row=>row.equivalent_reason||row.classification_reason).map(row=>'- `'+row.mutant+'`: '+(row.equivalent_reason||row.classification_reason)).join('\n');
  fs.writeFileSync(path.join(OUT,'mutation-table.md'),header+rows+'\n\nCells are actual exit codes for each complete named test file; a dash means not run. Historical31 and five round2 rows retain their original subset gates. All other historical rows and every new/review round5 row run every final test file. Syntax checks must pass. Every caught mutant must have at least one explicit assertion failure; additional contract exceptions are recorded but are not sole kill evidence. No spawn error, signal, syntax failure or timeout counts as a kill. Every worker audit must report zero network attempts.\n\n'+notes+'\n');
}
async function main(){
  assert.match(process.env.NODE_OPTIONS||'',/strict-network-guard\.cjs/,'guard must be inherited by children');
  const mutants=definitions();assert.equal(mutants.length,90);assert.equal(new Set(mutants.map(m=>m.id)).size,mutants.length);
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pot-admission-round5-mutants-')),base=path.join(scratch,'snapshot');
  const output={schema:'pot.admission.round5-mutations.v1',source_head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),guard:GUARD,
    scratch_outside_workspace:!scratch.startsWith(ROOT+path.sep),source_manifest:[],test_files:[],baseline:null,baseline_full_suite:null,rows:[]};
  fs.mkdirSync(OUT,{recursive:true});
  const write=()=>{fs.writeFileSync(path.join(OUT,'mutations.json'),JSON.stringify(output,null,2)+'\n');writeTable(output);};
  try{
    snapshot(ROOT,base);output.source_manifest=manifest(base);
    output.test_files=fs.readdirSync(path.join(base,'tests')).filter(f=>f.endsWith('.test.cjs')).sort().map(f=>'tests/'+f);
    output.baseline_full_suite=await run(base,['--test','--test-reporter=tap',...output.test_files],path.join(DEST,'baseline','full-suite.log'),{timeout:300000,minimumAudits:output.test_files.length+1});
    assert.equal(output.baseline_full_suite.exit_code,0,'baseline full suite');
    output.baseline=await suite(base,'baseline',output.test_files,DEST);write();
    assert.ok(Object.values(output.baseline).every(c=>c.exit_code===0),'baseline per-file suite');
    console.log(JSON.stringify({phase:'round5_baseline',files:output.test_files.length,counts:output.baseline_full_suite.test_counts,network_attempts:0}));
    for(const mutant of mutants){
      const directory=path.join(scratch,mutant.id);snapshot(base,directory);
      try{
        const file=path.join(directory,mutant.file),source=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'',changed=mutant.mutate(source);fs.writeFileSync(file,changed);
        const syntax=await run(directory,['--check',file],path.join(DEST,mutant.id,'syntax.log'));assert.equal(syntax.exit_code,0,'syntax '+mutant.id);
        const files=mutant.test_files||output.test_files,results=await suite(directory,mutant.id,files,DEST);
        for(const [testFile,cell] of Object.entries(results)){
          assert.equal(cell.signal,null,'worker signal '+mutant.id+'/'+testFile);assert.equal(cell.error,null,'worker spawn error');
          if(cell.exit_code!==0){assert.ok(cell.test_counts.fail>0,'failed worker needs failed tests');assert.equal(cell.test_counts.cancelled,0);}
        }
        const failing=files.filter(f=>results[f].exit_code!==0),assertionFiles=failing.filter(f=>/^\s+code: ['"]ERR_ASSERTION['"]/m.test(fs.readFileSync(path.join(ROOT,results[f].log),'utf8')));
        output.rows.push({mutant:mutant.id,group:mutant.group,file:mutant.file,changed_rule:mutant.rule||mutant.classification_reason||mutant.id,
          original_sha256:sha(source),mutant_sha256:sha(changed),transform:mutant.transformations?{operations:mutant.transformations}:mutant.from?{from:mutant.from,to:mutant.to}:mutant.mutate.toString(),
          ...(mutant.historical_transform?{historical_transform:mutant.historical_transform,retarget_reason:mutant.retarget_reason}:{}),
          syntax,results,killed:failing.length>0,failing_files:failing,explicit_assertion_files:assertionFiles,
          ...(mutant.stricter_only?{stricter_only:true,classification_reason:mutant.classification_reason}:{}),
          ...(!failing.length&&(equivalents[mutant.id]||mutant.equivalent_reason)?{equivalent_reason:equivalents[mutant.id]||mutant.equivalent_reason}:{})});
        write();assert.ok(!failing.length||assertionFiles.length>0,'a killed mutant needs an explicit assertion: '+mutant.id);
        console.log(JSON.stringify({mutant:mutant.id,killed:failing.length>0,failing_files:failing,network_attempts:0}));
      }finally{fs.rmSync(directory,{recursive:true,force:true});}
    }
    output.network_attempts=guard.attempts.length;assert.equal(output.network_attempts,0);
    output.network_audit_count=output.baseline_full_suite.network_audits.length+Object.values(output.baseline).reduce((n,c)=>n+c.network_audits.length,0)+output.rows.reduce((n,r)=>n+r.syntax.network_audits.length+Object.values(r.results).reduce((v,c)=>v+c.network_audits.length,0),0);
    assert.equal(output.rows.length,mutants.length);assert.deepEqual(output.rows.filter(r=>!r.killed&&!r.equivalent_reason).map(r=>r.mutant),[],'unexplained survivors');
    output.groups=Object.fromEntries([...new Set(output.rows.map(r=>r.group))].map(group=>{const rows=output.rows.filter(r=>r.group===group);return [group,{mutants:rows.length,killed:rows.filter(r=>r.killed).length,equivalent:rows.filter(r=>!r.killed).length}];}));
    const verify=path.join(scratch,'verify');snapshot(ROOT,verify);assert.deepEqual(manifest(verify),output.source_manifest,'source/test/evidence inputs changed during sweep');
    output.complete=true;
  }finally{fs.rmSync(scratch,{recursive:true,force:true});output.scratch_cleaned=!fs.existsSync(scratch);write();}
  console.log(JSON.stringify({groups:output.groups,network_attempts:output.network_attempts,network_audit_count:output.network_audit_count,scratch_cleaned:output.scratch_cleaned,complete:output.complete}));return output;
}
module.exports={main,definitions,snapshot,once};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
