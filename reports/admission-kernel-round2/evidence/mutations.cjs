'use strict';
const guard=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {ROOT}=require('./second-line-mutations.cjs');
const directory=path.join(ROOT,'reports/admission-kernel-round2');
async function main({collect=false}={}){
  // Reproduce the original31 gate and five semantic regressions first, then
  // run the full test suite against each of the thirteen second-line mutants.
  const legacy=collect?JSON.parse(fs.readFileSync(path.join(directory,'legacy-mutations.json'),'utf8')):await require('./legacy-mutations.cjs').main();
  const second=collect?JSON.parse(fs.readFileSync(path.join(directory,'second-line-mutations.json'),'utf8')):await require('./second-line-mutations.cjs').main();
  assert.equal(legacy.complete,true);assert.equal(second.complete,true);
  assert.equal(legacy.scratch_cleaned,true);assert.equal(second.scratch_cleaned,true);
  assert.equal(legacy.source_head,second.source_head,'all mutation groups must use the same checkpoint');
  assert.deepEqual(legacy.source_manifest,second.source_manifest,'all mutation groups must use identical source and tests');
  const files=[...new Set([...legacy.test_files,...second.test_files])].sort();
  const rows=[...legacy.rows,...second.rows.map(row=>({...row,group:'claude_second_line'}))];
  assert.equal(rows.length,49);assert.equal(new Set(rows.map(row=>row.mutant)).size,49);
  assert.ok(rows.every(row=>row.killed||row.equivalent_reason),'unexplained surviving mutants');
  const output={schema:'pot.admission.combined-mutations.v2',source_head:legacy.source_head,source_manifest:legacy.source_manifest,test_files:files,
    baseline:{legacy:legacy.baseline,second_line:second.baseline,full_suite:second.baseline_full_suite},rows,
    legacy31:{mutants:31,killed:legacy.rows.filter(row=>row.group==='legacy31'&&row.killed).length,equivalent:legacy.rows.filter(row=>row.group==='legacy31'&&!row.killed).length},
    round2_semantics:{mutants:5,killed:legacy.rows.filter(row=>row.group==='round2_semantics'&&row.killed).length},
    claude_second_line:{mutants:13,killed:second.rows.filter(row=>row.killed).length,equivalent:second.rows.filter(row=>!row.killed).length},
    network_attempts:legacy.network_attempts+second.network_attempts,network_audit_count:legacy.network_audit_count+second.network_audit_count,
    scratch_cleaned:true,complete:true};
  assert.equal(output.network_attempts,0);assert.equal(guard.attempts.length,0);
  fs.writeFileSync(path.join(directory,'mutations.json'),JSON.stringify(output,null,2)+'\n');
  const header='| Mutant | '+files.map(file=>path.basename(file)).join(' | ')+' | Outcome |\n| --- | '+files.map(()=> '---').join(' | ')+' | --- |\n';
  const table=rows.map(row=>'| '+row.mutant+' | '+files.map(file=>row.results[file]?String(row.results[file].exit_code):'—').join(' | ')+' | '+(row.killed?'killed':'equivalent')+' |').join('\n');
  const equivalents=rows.filter(row=>row.equivalent_reason).map(row=>'- `'+row.mutant+'`: '+row.equivalent_reason).join('\n');
  fs.writeFileSync(path.join(directory,'mutation-table.md'),header+table+'\n\nEach number is the exit code for that complete test file; a dash means not run. Original31 rows run the original four-file gate, with the second-line file added to the set-signal row to check unknown codes independently of the new release vocabulary. The five new semantic rows run parity and second-line tests. Every one of the thirteen review mutants runs every test file. All syntax checks exit 0 and all worker network audits record zero attempts.\n\n'+equivalents+'\n');
  console.log(JSON.stringify({legacy31:output.legacy31,round2_semantics:output.round2_semantics,claude_second_line:output.claude_second_line,
    network_attempts:output.network_attempts,network_audit_count:output.network_audit_count,scratch_cleaned:true}));
  return output;
}
module.exports={main};
if(require.main===module)main({collect:process.argv.includes('--collect')}).catch(error=>{console.error(error);process.exitCode=1;});
