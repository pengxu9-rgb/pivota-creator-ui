'use strict';
// Only a cloned training journey is used as a stand-in. No real held-out set is read or authored.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {training,ROOT}=require('./journey-data.cjs'),{load,loadQualified,assertBound}=require('./validate-heldout.cjs');
const {createCollector}=require('../../src/lib/pokemon/shopping/model/collector.cjs');
const {runArm,runHeldoutBaseline}=require('./orchestrate.cjs'),{scoreHeldout}=require('../../src/lib/pokemon/shopping/model/scoring.cjs');
function standin(dir){
 const set=structuredClone(training);set.journeys=[set.journeys[1]];set.journeys[0].id='STANDIN';set.journeys[0].catalog='catalog.json';
 fs.writeFileSync(dir+'/standin.json',JSON.stringify(set)+'\n');fs.copyFileSync(ROOT+'/tests/fixtures/shopping/catalog.json',dir+'/catalog.json');return dir+'/standin.json';
}
async function qualify(raw){
 fs.mkdirSync(raw,{recursive:true});const input=fs.mkdtempSync(path.join(os.tmpdir(),'shopping-standin-'));let c;
 try{
  const file=standin(input),heldout=await loadQualified(file),freeze={...require('./freeze.json'),heldout_fixture:heldout.binding};let calls=0;
  const tampered=structuredClone(heldout);tampered.set.journeys[0].query+=' changed';assert.throws(()=>assertBound(tampered,heldout.binding));
  c=createCollector({freeze,artifactBytes:p=>fs.readFileSync(ROOT+'/'+p),checkpoint:raw+'/checkpoint.json',tokenExpiresAt:Date.now()+3600000,rehearsal:true,plan:'heldout',transport:async({request})=>{
   calls++;const parts=request.contents.some(c=>c.role==='model')?[{text:'{"decision":"search","fields":[],"claims":[]}'}]:[{functionCall:{name:'search_catalog',args:{}}}];
   return {status:200,tls_connected:true,stage_reached:'http_status',body:{usageMetadata:{promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:2},candidates:[{finishReason:'STOP',content:{parts}}]}};
  }});
  await assert.rejects(runArm(c,'P',{plan:'heldout',heldout}),/heldout_is_L_only/);
  await assert.rejects(runArm(c,'L',{plan:'heldout'}),/bound_heldout_required/);
  await runArm(c,'L',{plan:'heldout',heldout});const s=c.state(),baseline=await runHeldoutBaseline(heldout),scored=scoreHeldout(s,baseline,heldout);
  assert.equal(scored.expected,10);assert.equal(scored.completed,10);assert.equal(scored.L.M2_missed_necessary_questions.total,0);assert.equal(scored.L.M2_missed_necessary_questions.threshold,null);
  assert.deepEqual(scored.model_participation,{observed:10,not_observed:0,unrecorded:0});
  const withoutReceipts=scoreHeldout({...s,records:[]},baseline,heldout);
  assert.equal(withoutReceipts.completed,0);
  assert.deepEqual(withoutReceipts.model_participation,{observed:0,not_observed:10,unrecorded:0});
  assert.equal(withoutReceipts.L.M2_missed_necessary_questions.missing,10);
  assert.throws(()=>scoreHeldout(s,baseline.slice(1),heldout),/heldout_scoring_baseline_mismatch/);
  assert.throws(()=>scoreHeldout(s,baseline,tampered),/heldout_scoring_binding_mismatch/);
  assert.equal(s.arms.P.calls,0);assert.equal(s.records.length,calls);assert.ok(s.outcomes.filter(o=>o.id.startsWith('journey/')).every(o=>o.result.journey==='STANDIN'));
  assert.ok(!s.outcomes.some(o=>/^(adversarial|fault|compatibility)\//.test(o.id)));
  // A catalog edit invalidates the binding even when it remains a valid synthetic catalog.
  const cat=JSON.parse(fs.readFileSync(input+'/catalog.json'));cat.offers[0].price_minor='28001';fs.writeFileSync(input+'/catalog.json',JSON.stringify(cat));assert.throws(()=>load(file,{expected:heldout.binding}));
  const result={passed:true,standin_only:true,real_heldout_read:false,model_calls:0,counts:heldout.counts,L_episodes:scored.completed,baseline_episodes:baseline.length,P_calls:s.arms.P.calls,fake_transport_requests:calls,scored};
  fs.writeFileSync(raw+'/qualification.json',JSON.stringify(result,null,2)+'\n');return result;
 }finally{c?.close();fs.rmSync(input,{recursive:true,force:true});}
}
if(require.main===module)qualify(process.argv[2]).then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
module.exports={qualify,standin};
