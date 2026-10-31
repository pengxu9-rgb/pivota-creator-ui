'use strict';
const {attempts}=require('../../../tests/helpers/strict-network-guard.cjs');
const {runMatrix,runModelRouterSlice}=require('./parity-matrix.cjs');
const {startAudit,finishAudit,write}=require('./audit.cjs');
const audit=startAudit(__filename);
(async()=>{
  let output;
  try{output={schema:'pot.admission.semantic-parity.round3.v1',passed:true,...runMatrix(),real_model_router_slice:await runModelRouterSlice()};}
  catch(error){output={schema:'pot.admission.semantic-parity.round3.v1',passed:false,error:{message:error.message,stack:error.stack}};}
  Object.assign(output,finishAudit(audit),{network_attempts:attempts.length});
  if(attempts.length||!output.source_hashes_unchanged||!output.test_hashes_unchanged||!output.evidence_inputs_unchanged||!output.source_head_unchanged)output.passed=false;
  output.exact_exit_code=output.passed?0:1;process.exitCode=output.exact_exit_code;write('parity-matrix.json',output);
  console.log(JSON.stringify({passed:output.passed,executed_cells:output.executed_cells,held_cells:output.held_cells,router_slice_cells:output.real_model_router_slice?.executed_cells,error:output.error?.message,network_attempts:attempts.length,exit_code:output.exact_exit_code}));
})();
