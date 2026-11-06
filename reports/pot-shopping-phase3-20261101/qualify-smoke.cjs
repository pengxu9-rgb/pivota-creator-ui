'use strict';
// Fake-transport qualification of the smoke plan: L only, J01-J04 twice, no cases, never scored.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),raw=path.resolve(process.argv[2]);
fs.mkdirSync(raw,{recursive:true});
const {createCollector,SMOKE_BUDGETS}=require(ROOT+'/src/lib/pokemon/shopping/model/collector.cjs');
const {runArm}=require('./orchestrate.cjs');
const freeze=require('./freeze.json');
let calls=0;
// Shapes seen in run 1: a shortened model query, then a fenced plan.
const transport=async({request})=>{
    calls++;
    const first=JSON.parse(request.contents[0].parts[0].text);
    const parts=request.contents.some(c=>c.role==='model')?[{text:'```json\n{"decision":"search","fields":[],"claims":[]}\n```'}]:[{functionCall:{name:'search_catalog',args:{task_ref:first.task_ref,text:String(first.text).split(' ').slice(-1)[0]}}}];
    return {status:200,tls_connected:true,stage_reached:'http_status',body:{usageMetadata:{promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:2},candidates:[{finishReason:'STOP',content:{parts}}]}};
};
const open=plan=>createCollector({freeze,artifactBytes:p=>fs.readFileSync(ROOT+'/'+p),checkpoint:raw+'/checkpoint.json',tokenExpiresAt:Date.now()+3600000,rehearsal:true,plan,transport});
(async()=>{
    const c=open('smoke');
    try{
        await assert.rejects(runArm(c,'P',{plan:'smoke'}),/smoke_is_L_only/);
        await assert.rejects(runArm(c,'L'),/collector_plan_mismatch/);
        await runArm(c,'L',{plan:'smoke'});
        const s=c.state(),o=s.outcomes.filter(r=>r.arm==='L');
        const episodes=o.filter(r=>r.id.startsWith('journey/'));
        const turns=o.filter(r=>r.id.startsWith('model_turn/')).map(r=>r.result);
        const reasons={};for(const t of turns)if(t.fallback)reasons[t.reason]=(reasons[t.reason]||0)+1;
        const result={fake:true,model_calls:0,plan:s.plan,episodes:episodes.length,completed:episodes.filter(r=>r.result.completed).length,cases:o.filter(r=>/^(adversarial|fault|compatibility)\//.test(r.id)).length,arm_finished:c.priorOutcome('L','arm_finished'),turns:turns.length,fenced_plans:turns.filter(t=>t.plan_format==='fenced').length,model_queries:turns.flatMap(t=>t.audit||[]).filter(a=>a.model_query!==undefined).length,fallback_reasons:reasons,P_calls:s.arms.P.calls,fake_transport_requests:calls,usd:s.arms.L.usd};
        assert.equal(result.plan,'smoke');
        assert.equal(result.episodes,8);
        assert.equal(result.completed,8);
        assert.equal(result.cases,0);
        assert.deepEqual(result.arm_finished,{status:'completed'});
        assert.ok(result.fenced_plans>0,'fenced plans accepted');
        assert.ok(result.model_queries>0,'model queries recorded, never forwarded');
        assert.equal(reasons.invalid_answer_plan,undefined);
        assert.equal(reasons.original_text_required,undefined);
        assert.equal(result.P_calls,0);
        assert.ok(calls<=SMOKE_BUDGETS.calls&&result.usd<=SMOKE_BUDGETS.usd_per_arm.L);
        c.close();
        assert.throws(()=>open('reduced'),/resume_plan_mismatch/);
        fs.writeFileSync(raw+'/qualification.json',JSON.stringify(result,null,2)+'\n');
        process.stdout.write(JSON.stringify(result)+'\n');
    }finally{c.close();}
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
