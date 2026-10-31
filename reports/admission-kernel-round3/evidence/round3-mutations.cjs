'use strict';
// Round-3 semantic deletions. Every new mutant runs every test file, including
// the direct detector contracts that prevent the whole-text grammar from
// masking an independently removed commercial signal family.
const guardState=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {run,suite,copySnapshot,manifest,sha,ROOT,GUARD}=require('./second-line-mutations.cjs');
const {removeCondition}=require('./legacy-mutations.cjs');
const DEST=path.join(ROOT,'reports/admission-kernel-round3/round3-mutations');
const FILE='src/lib/pokemon/admission.cjs';
function once(source,from,to){assert.equal(source.split(from).length,2,'mutation target must be unique: '+from);return source.replace(from,to);}
function definitions(){
  // These deletions target independent signal expressions; tests and fixtures
  // remain identical in each copy.
  return [
    {id:'remove_whole_text_positive_grammar',file:FILE,rule:'R3-1/R3-5 whole-text positive grammar for every ask and text reply',
      mutate:source=>removeCondition(source,'whole_text_positive_grammar')},
    {id:'remove_residual_digit_completion',file:FILE,rule:'R3-2 residual Unicode decimal sequences include attached units and arbitrary suffixes',
      mutate:source=>once(source,String.raw`return /\p{Nd}+/u.test(residual);`,String.raw`return /(?:^|[^\p{L}\p{N}])\p{Nd}+(?:[.,]\p{Nd}+)?(?![\p{L}\p{N}])/u.test(residual);`)},
    ...[
      ['remove_cjk_comparison_family','R3_CJK_COMPARISON','R3-2 CJK comparison wording'],
      ['remove_english_comparison_family','R3_ENGLISH_COMPARISON','R3-2 English comparison wording'],
      ['remove_extended_symbol_family','R3_EXTENDED_SYMBOL','R3-2 extended comparison symbols'],
      ['remove_cjk_numeral_amount_family','R3_CJK_AMOUNT','R3-2 CJK numeral amounts next to currencies or comparisons'],
      ['remove_grade_wording_family','R3_GRADE_WORDING','R3-2 slabbed/unslabbed, grade plurals and NM'],
    ].map(([id,name,rule])=>({id,file:FILE,rule,mutate:source=>once(source,'||'+name+'.test(text)','')})),
  ];
}
function table(output){
  const files=output.test_files;
  const header='| Mutant | '+files.map(file=>path.basename(file)).join(' | ')+' | Outcome |\n| --- | '+files.map(()=> '---').join(' | ')+' | --- |\n';
  const rows=output.rows.map(row=>'| '+row.mutant+' | '+files.map(file=>String(row.results[file].exit_code)).join(' | ')+' | '+(row.killed?'killed':row.equivalent_reason?'equivalent':'SURVIVED')+' |').join('\n');
  const equivalents=output.rows.filter(row=>row.equivalent_reason).map(row=>'- `'+row.mutant+'`: '+row.equivalent_reason).join('\n');
  fs.writeFileSync(path.join(ROOT,'reports/admission-kernel-round3/round3-mutation-table.md'),header+rows+'\n\nEvery cell executes the complete named test file. A zero is exit 0; a nonzero is a test failure. All syntax checks must exit 0. Every worker reports a strict network audit with zero attempts. Tests and fixtures are copied identically for every mutant; only the named source transform changes.\n\n'+equivalents+'\n');
}
async function main(){
  const mutants=definitions();assert.equal(mutants.length,7);assert.equal(new Set(mutants.map(row=>row.id)).size,mutants.length);
  const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pot-admission-round3-new-mutants-')),snapshot=path.join(scratch,'snapshot');
  const output={schema:'pot.admission.round3-mutations.v1',source_head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),
    guard:GUARD,scratch_outside_workspace:!scratch.startsWith(ROOT+path.sep),test_files:[],source_manifest:[],baseline:null,rows:[]};
  const write=()=>fs.writeFileSync(path.join(ROOT,'reports/admission-kernel-round3/round3-mutations.json'),JSON.stringify(output,null,2)+'\n');
  fs.mkdirSync(DEST,{recursive:true});
  try {
    copySnapshot(ROOT,snapshot);output.source_manifest=manifest(snapshot);
    output.test_files=fs.readdirSync(path.join(snapshot,'tests')).filter(file=>file.endsWith('.test.cjs')).sort().map(file=>'tests/'+file);
    output.baseline=await suite(snapshot,'baseline',output.test_files,DEST);write();
    assert.ok(Object.values(output.baseline).every(value=>value.exit_code===0),'new-mutant baseline must pass');
    console.log(JSON.stringify({phase:'round3_baseline',files:output.test_files.length,network_attempts:0}));
    for(const mutant of mutants){
      const directory=path.join(scratch,mutant.id);copySnapshot(snapshot,directory);
      try {
        const file=path.join(directory,mutant.file),source=fs.readFileSync(file,'utf8'),changed=mutant.mutate(source);fs.writeFileSync(file,changed);
        const syntax=await run(directory,['--check',file],path.join(DEST,mutant.id,'syntax.log'));
        assert.equal(syntax.exit_code,0,'syntax-invalid mutant cannot count as killed: '+mutant.id);
        const results=await suite(directory,mutant.id,output.test_files,DEST),failing=output.test_files.filter(file=>results[file].exit_code!==0);
        output.rows.push({mutant:mutant.id,group:'round3_semantics',file:mutant.file,changed_rule:mutant.rule,
          original_sha256:sha(source),mutant_sha256:sha(changed),transform:mutant.mutate.toString(),syntax,
          results,killed:failing.length>0,failing_files:failing,
          ...(!failing.length&&mutant.equivalent_reason?{equivalent_reason:mutant.equivalent_reason}:{})});
        write();table(output);console.log(JSON.stringify({mutant:mutant.id,killed:failing.length>0,failing_files:failing,network_attempts:0}));
      }finally{fs.rmSync(directory,{recursive:true,force:true});}
    }
    output.network_attempts=guardState.attempts.length;
    output.network_audit_count=Object.values(output.baseline).reduce((n,row)=>n+row.network_audits.length,0)+
      output.rows.reduce((n,row)=>n+row.syntax.network_audits.length+Object.values(row.results).reduce((v,cell)=>v+cell.network_audits.length,0),0);
    assert.equal(output.network_attempts,0);
    assert.deepEqual(output.rows.filter(row=>!row.killed&&!row.equivalent_reason).map(row=>row.mutant),[],'unexplained surviving round-3 mutants');
    output.complete=true;
  }finally{fs.rmSync(scratch,{recursive:true,force:true});output.scratch_cleaned=!fs.existsSync(scratch);write();}
  console.log(JSON.stringify({round3_mutants:output.rows.length,killed:output.rows.filter(row=>row.killed).length,equivalent:output.rows.filter(row=>!row.killed).length,
    network_attempts:output.network_attempts,network_audit_count:output.network_audit_count,scratch_cleaned:output.scratch_cleaned}));
  return output;
}
module.exports={main,definitions,once};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
