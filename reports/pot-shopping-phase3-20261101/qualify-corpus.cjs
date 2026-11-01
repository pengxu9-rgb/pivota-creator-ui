'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),raw=process.argv[2];
fs.mkdirSync(raw,{recursive:true});
const {createCollector}=require(ROOT+'/src/lib/pokemon/shopping/model/collector.cjs');
const {median,p95}=require(ROOT+'/src/lib/pokemon/shopping/model/scoring.cjs');
const {runArm,runBaseline}=require('./orchestrate.cjs');
const freeze=require('./freeze.json');
let calls=0;
const transport=async({request})=>{
    calls++;
    const first=JSON.parse(request.contents[0].parts[0].text);
    const parts=request.contents.some(c=>c.role==='model')?[{text:'{"decision":"search","fields":[],"claims":[]}'}]:[{functionCall:{name:'search_catalog',args:{task_ref:first.task_ref,text:first.text}}}];
    return {status:200,tls_connected:true,stage_reached:'http_status',body:{usageMetadata:{promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:2},candidates:[{finishReason:'STOP',content:{parts}}]}};
};
const c=createCollector({freeze,artifactBytes:p=>fs.readFileSync(ROOT+'/'+p),checkpoint:raw+'/checkpoint.json',tokenExpiresAt:Date.now()+3600000,rehearsal:true,transport});
(async()=>{
    const baseline=await runBaseline();
    const control={completed:baseline.filter(r=>r.passed).length,unnecessary_median:median(baseline.map(r=>r.unnecessary_clarifications)),unnecessary_p95:p95(baseline.map(r=>r.unnecessary_clarifications))};
    assert.equal(control.completed,40);
    const result={fake:true,model_calls:0,baseline_completed:control.completed,arms:{}};
    for(const arm of ['L','P']){
        await runArm(c,arm);
        const o=c.state().outcomes.filter(r=>r.arm===arm);
        const journeys=o.filter(r=>r.id.startsWith('journey/'));
        const cases=o.filter(r=>r.id.startsWith('adversarial/')||r.id.startsWith('fault/'));
        const compat=o.filter(r=>r.id.startsWith('compatibility/'));
        result.arms[arm]={episodes:journeys.length,completed:journeys.filter(r=>r.result.completed).length,same_host_cases:cases.length,passed_cases:cases.filter(r=>r.result.passed&&r.result.same_host_oracle).length,compatibility:compat.length,unreachable:compat.filter(r=>r.result.compatibility_record.unreachable).length};
        assert.equal(result.arms[arm].completed,40);
        assert.equal(result.arms[arm].passed_cases,18);
        assert.equal(compat.length,778);
    }
    const scoring=require('./score.cjs').score(c.state(),control);
    assert.equal(scoring.rehearsal,true);
    assert.equal(Object.keys(scoring.arms).length,2);
    assert.equal(scoring.conclusion,'fake replay only; no live conclusion');
    for(const arm of Object.values(scoring.arms))assert.equal(arm.metrics.completed,40);
    fs.writeFileSync(raw+'/scoring.json',JSON.stringify(scoring,null,2)+'\n');
    result.scorer_replayed_both_arms=true;
    result.fake_transport_requests=calls;
    c.close();
    fs.writeFileSync(raw+'/qualification.json',JSON.stringify(result,null,2)+'\n');
    process.stdout.write(JSON.stringify(result)+'\n');
})().catch(error=>{c.close();process.stderr.write(error.stack+'\n');process.exitCode=1;});
