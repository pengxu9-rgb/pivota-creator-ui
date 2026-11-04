'use strict';
// Execute the historical Git blob as an independent oracle, never retain an old driver in runtime.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),Module=require('node:module'),assert=require('node:assert/strict');
const {hash}=require('../../src/lib/pokemon/shopping/schema.cjs');
const ROOT=path.resolve(__dirname,'../..'),BASE='12dc3a19299c19e200541c4261a69658c26a1b72';
function historical(file){const mod=new Module(ROOT+'/'+file);mod.filename=ROOT+'/'+file;mod.paths=Module._nodeModulePaths(path.dirname(mod.filename));mod._compile(cp.execFileSync('git',['show',BASE+':'+file],{cwd:ROOT,encoding:'utf8'}),mod.filename);return mod.exports;}
function collector(kind){const requests=[],outcomes=[];return {requests,outcomes,channel:()=>{let n=0;return Object.defineProperty(async request=>{
 requests.push(structuredClone(request));n++;
 const parts=kind==='clarify'&&n===1?[{text:'{"decision":"clarify","fields":["language"],"claims":[]}'}]:kind==='answer'?[{text:'{"decision":"answer","fields":[],"claims":[]}'}]:request.contents.some(c=>c.role==='model')?[{text:'{"decision":"search","fields":[],"claims":[]}'}]:[{functionCall:{name:'search_catalog',args:{task_ref:'task_1',text:'ignored shortened model text'}}}];
 return {status:200,tls_connected:true,body:{usageMetadata:{promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:2},candidates:[{finishReason:'STOP',content:{parts}}]}};
 },'elapsedMs',{value:()=>0});},session:()=>({elapsed:()=>0,observe:()=>0}),outcome:(arm,id,result)=>{outcomes.push({arm,id,result:structuredClone(result)});return result;}};}
function oldShape(r){const copy=structuredClone(r);delete copy.missed_necessary_questions;return copy;}
async function qualify(){
 const now=Date.now;Date.now=()=>1793491200000;
 try{
  const old=historical('reports/pot-shopping-phase3-20261101/orchestrate.cjs'),fresh=require('./orchestrate.cjs'),legacyBaseline=historical('tests/shopping/evaluate.cjs');
  const {training}=require('./journey-data.cjs'),rows=[];
  for(const j of training.journeys){
   const a=await legacyBaseline.episode('model-off',j),b=await require('./baseline-v2.cjs').episode('model-off',j);
   assert.equal(JSON.stringify(a),JSON.stringify(oldShape(b)),'model-off '+j.id);rows.push({journey:j.id,transport:'model-off',sha256:hash(a),identical:true});
   for(const kind of ['answer','corpus','clarify'])for(const arm of ['L','P']){
    const c=collector(kind),d=collector(kind),id='journey/'+j.id+'/1';
    const before=await old.shoppingEpisode(c,arm,id,j),after=await fresh.shoppingEpisode(d,arm,id,j);
    assert.equal(JSON.stringify(before),JSON.stringify(oldShape(after)),kind+' '+arm+' '+j.id);
    assert.equal(JSON.stringify(c.requests),JSON.stringify(d.requests),'requests '+kind+' '+j.id);
    assert.equal(JSON.stringify(c.outcomes),JSON.stringify(d.outcomes),'durable turns '+kind+' '+j.id);
    rows.push({journey:j.id,transport:kind,arm,identical:true,outcome_sha256:hash(before),requests:c.requests.length,requests_sha256:hash(c.requests),turn_outcomes_sha256:hash(c.outcomes)});
   }
  }
  return {passed:true,baseline:BASE,comparisons:rows.length,additive_metric:'missed_necessary_questions excluded from legacy byte comparison only',rows};
 }finally{Date.now=now;}
}
if(require.main===module)qualify().then(r=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(r,null,2)+'\n');process.stdout.write(JSON.stringify({passed:r.passed,comparisons:r.comparisons})+'\n');}).catch(e=>{process.stderr.write(e.stack+'\n');process.exitCode=1;});
module.exports={qualify,collector};
