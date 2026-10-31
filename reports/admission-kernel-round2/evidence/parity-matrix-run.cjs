'use strict';
const {attempts}=require('../../../tests/helpers/strict-network-guard.cjs');
const {runMatrix}=require('./parity-matrix.cjs');
const {startAudit,finishAudit,write}=require('./audit.cjs');
const audit=startAudit(__filename);let output;
try{output={schema:'pot.admission.semantic-parity.round2.v1',passed:true,...runMatrix()};}
catch(error){output={schema:'pot.admission.semantic-parity.round2.v1',passed:false,error:{message:error.message,stack:error.stack}};}
Object.assign(output,finishAudit(audit),{network_attempts:attempts.length});
if(attempts.length||!output.source_hashes_unchanged||!output.test_hashes_unchanged||!output.evidence_inputs_unchanged||!output.source_head_unchanged)output.passed=false;
output.exact_exit_code=output.passed?0:1;process.exitCode=output.exact_exit_code;
write('parity-matrix.json',output);
console.log(JSON.stringify({passed:output.passed,executed_cells:output.executed_cells,held_cells:output.held_cells,unique_raw_texts:output.unique_raw_texts,unique_nfkc_texts:output.unique_nfkc_texts,unique_effective_cells:output.unique_effective_cells,repeated_effective_cells:output.repeated_effective_cells,unique_nfkc_effective_cells:output.unique_nfkc_effective_cells,repeated_nfkc_effective_cells:output.repeated_nfkc_effective_cells,error:output.error?.message,network_attempts:attempts.length,exit_code:output.exact_exit_code}));
