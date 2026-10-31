'use strict';
// Historical harnesses remain byte-identical. Only output destinations change
// in memory; the receipt binds the exact executed output-only transform.
const {attempts}=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Module=require('node:module');
const ROOT=path.resolve(__dirname,'../../..'),OUT=path.resolve(__dirname,'..');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.match(process.env.NODE_OPTIONS||'',/strict-network-guard\.cjs/);
const gate=process.argv[2],config={
  round4:{file:'reports/admission-kernel-round4/evidence/native-stored-goals.cjs',directory:'prior-round4-native',outputToken:"NEW_OUT=path.resolve(__dirname,'..')",outputName:'NEW_OUT'},
  round3:{file:'reports/admission-kernel-round3/evidence/native-admitted-replay.cjs',helper:'reports/admission-kernel-round3/evidence/audit.cjs',directory:'prior-round3-native'},
  round2:{file:'reports/admission-kernel-round2/evidence/native-admitted-replay.cjs',helper:'reports/admission-kernel-round2/evidence/audit.cjs',directory:'prior-round2-native'},
  original:{file:'reports/admission-kernel/evidence/native-replay.cjs',directory:'prior-native15',outputToken:"OUT=path.resolve(__dirname,'..')",outputName:'OUT'},
  clarification:{file:'reports/admission-kernel-round3/evidence/clarification-rate.cjs',helper:'reports/admission-kernel-round3/evidence/audit.cjs',directory:'clarification'},
}[gate];
assert.ok(config,'usage: run-prior-gate.cjs round4|round3|round2|original|clarification');
const file=path.join(ROOT,config.file),newOut=path.join(OUT,config.directory);fs.mkdirSync(newOut,{recursive:true});
const receipt={schema:'pot.admission.prior-gate-output-relocation.round5.v1',gate,file,harness_sha256:hash(file),wrapper_sha256:hash(__filename),new_output_directory:newOut,node_options:process.env.NODE_OPTIONS,reason:'Only output destinations are intercepted in memory. No historical source, worker or evidence file is edited.'};
if(config.helper){
  const helperFile=path.join(ROOT,config.helper),helper=require(helperFile);
  Object.assign(receipt,{helper:helperFile,helper_sha256:hash(helperFile),old_output_directory:helper.OUT,hooked_exports:['OUT','write'],original_write:helper.write.toString()});
  helper.OUT=newOut;helper.write=(name,value)=>fs.writeFileSync(path.join(newOut,name),JSON.stringify(value,null,2)+'\n');receipt.redirected_write=helper.write.toString();
}else{
  const source=fs.readFileSync(file,'utf8'),from=config.outputToken,to=config.outputName+'='+JSON.stringify(newOut);
  assert.equal(source.split(from).length,2,'output-only target must occur once');receipt.transform={from,to};receipt.executed_sha256=crypto.createHash('sha256').update(source.replace(from,()=>to)).digest('hex');
}
process.on('exit',code=>{
  receipt.harness_sha256_after=hash(file);receipt.harness_unchanged=receipt.harness_sha256_after===receipt.harness_sha256;
  if(config.helper)receipt.helper_unchanged=hash(receipt.helper)===receipt.helper_sha256;
  receipt.node_network_attempts=attempts.length;receipt.exact_exit_code=code;
  if(!receipt.harness_unchanged||receipt.helper_unchanged===false||attempts.length)process.exitCode=1;
  fs.writeFileSync(path.join(OUT,gate+'-invocation.json'),JSON.stringify(receipt,null,2)+'\n');
});
if(config.helper)require(file);
else{const compiled=new Module(file,module);compiled.filename=file;compiled.paths=Module._nodeModulePaths(path.dirname(file));compiled._compile(fs.readFileSync(file,'utf8').replace(receipt.transform.from,()=>receipt.transform.to),file);}
