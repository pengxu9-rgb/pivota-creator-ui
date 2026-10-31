'use strict';
// Rehearse only lifecycle: real isolated fake-proxy replies drive the existing
// guard VM with its fake token/TLS. No credential or external connection.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const [root,out]=process.argv.slice(2),strict=require(root+'/tests/helpers/strict-network-guard.cjs');
const {physicalProxy,fixture}=require(root+'/reports/admission-kernel-live-model/guard-tests.cjs');
assert.ok((process.env.NODE_OPTIONS||'').includes('strict-network-guard.cjs'));
assert.equal(fs.existsSync(out),false);fs.mkdirSync(out,{recursive:true});
const physical=physicalProxy();
assert.equal(physical.authorized_loopback_connections,6);assert.equal(physical.denied_attempts.length,3);assert.equal(physical.external_connections,0);
async function main(){
  const f=fixture(physical,'success');
  for(let completed=1;completed<=10;completed++){
    await new Promise(resolve=>setTimeout(resolve,3000));
    const response=await f.api.fetchImpl(f.api.endpoint,f.options());assert.equal(response.status,200);await response.json();
    const receipt=f.api.auditSnapshot();assert.equal(receipt.denied_attempts,0);
    const state={mode:'offline_rehearsal',pid:process.pid,completed,synthetic_token_only:true,real_external_connections:0,
      physical_fake_proxy_connections:physical.authorized_loopback_connections,vm_verified_tls_requests:receipt.tls_connections,parent_strict_attempts:strict.attempts.length};
    fs.writeFileSync(path.join(out,'checkpoint.json.tmp'),JSON.stringify(state)+'\n');fs.renameSync(path.join(out,'checkpoint.json.tmp'),path.join(out,'checkpoint.json'));
  }
  f.processFake.emit('exit');assert.equal(strict.attempts.length,0);
  fs.writeFileSync(path.join(out,'rehearsal-final.json'),JSON.stringify({passed:true,completed:10,physical_fake_proxy_connections:6,negative_controls_denied_before_OS:3,
    actual_external_connections:0,TLS_mocked:true,fake_token_only:true,parent_strict_attempts:0,signals_sent:0})+'\n');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
