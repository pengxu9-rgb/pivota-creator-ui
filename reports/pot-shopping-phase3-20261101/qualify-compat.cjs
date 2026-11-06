'use strict';
// Fake-transport qualification of the compatibility plan: L only, 389 held-out contexts, both passes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),raw=path.resolve(process.argv[2]);
fs.mkdirSync(raw,{recursive:true});
const {createCollector,COMPAT_BUDGETS}=require(ROOT+'/src/lib/pokemon/shopping/model/collector.cjs');
const {scoreCompatibility,score}=require(ROOT+'/src/lib/pokemon/shopping/model/scoring.cjs');
const {runArm}=require('./orchestrate.cjs');
const mapping=require(ROOT+'/tests/fixtures/shopping-model-eval/compatibility-mapping.json');
const freeze=require('./freeze.json');
let calls=0;
const transport=async({request})=>{
    calls++;
    const first=JSON.parse(request.contents[0].parts[0].text);
    const parts=request.contents.some(c=>c.role==='model')?[{text:'{"decision":"search","fields":[],"claims":[]}'}]:[{functionCall:{name:'search_catalog',args:{task_ref:first.task_ref}}}];
    return {status:200,tls_connected:true,stage_reached:'http_status',body:{usageMetadata:{promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:2},candidates:[{finishReason:'STOP',content:{parts}}]}};
};
const open=plan=>createCollector({freeze,artifactBytes:p=>fs.readFileSync(ROOT+'/'+p),checkpoint:raw+'/checkpoint.json',tokenExpiresAt:Date.now()+3600000,rehearsal:true,plan,transport});
(async()=>{
    const c=open('compatibility');
    try{
        await assert.rejects(runArm(c,'P',{plan:'compatibility'}),/compatibility_is_L_only/);
        await assert.rejects(runArm(c,'L'),/collector_plan_mismatch/);
        await runArm(c,'L',{plan:'compatibility'});
        const s=c.state(),o=s.outcomes.filter(r=>r.arm==='L');
        const contexts=o.filter(r=>r.id.startsWith('compatibility/'));
        const scored=scoreCompatibility(s,mapping);
        const result={fake:true,model_calls:0,plan:s.plan,contexts:contexts.length,unreachable:contexts.filter(r=>r.result.compatibility_record.unreachable).length,journeys:o.filter(r=>r.id.startsWith('journey/')).length,arm_finished:c.priorOutcome('L','arm_finished'),P_calls:s.arms.P.calls,fake_transport_requests:calls,usd:s.arms.L.usd,scored:scored.arms.L};
        assert.equal(result.plan,'compatibility');
        assert.equal(result.contexts,778);
        assert.equal(result.journeys,0);
        assert.deepEqual(result.arm_finished,{status:'completed'});
        assert.equal(result.P_calls,0);
        assert.ok(calls<=COMPAT_BUDGETS.calls&&result.usd<=COMPAT_BUDGETS.usd_per_arm.L);
        assert.equal(typeof scored.arms.L.thresholds.compatibility,'boolean');
        assert.equal(typeof scored.arms.L.thresholds.zero_catalog_hold_flips,'boolean');
        assert.throws(()=>score(s,{completed:40,unnecessary_median:0},mapping,freeze),/use_scoreCompatibility/);
        c.close();
        assert.throws(()=>open('reduced'),/resume_plan_mismatch/);
        fs.writeFileSync(raw+'/qualification.json',JSON.stringify(result,null,2)+'\n');
        process.stdout.write(JSON.stringify(result)+'\n');
    }finally{c.close();}
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
