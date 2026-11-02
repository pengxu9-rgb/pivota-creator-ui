'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),raw=process.argv[2];
const {createCollector,atomic}=require(ROOT+'/src/lib/pokemon/shopping/model/collector.cjs');
const {shoppingEpisode,modelHost}=require('./orchestrate.cjs');
const {setup,journeys}=require(ROOT+'/tests/shopping/helpers.cjs');
const freeze=require('./freeze.json');
let transportCalls=0;
const transport=async({request})=>{
    transportCalls++;
    const first=JSON.parse(request.contents[0].parts[0].text);
    const continued=request.contents.some(c=>c.role==='model');
    const parts=continued?[{text:'{"decision":"search","fields":[],"claims":[]}'}]:[{functionCall:{name:'search_catalog',args:{task_ref:first.task_ref,text:first.text},id:'fixture_call'},thoughtSignature:'fixture_signature'}];
    return {status:200,tls_connected:true,stage_reached:'http_status',body:{usageMetadata:{promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:2},candidates:[{finishReason:'STOP',content:{parts}}]}};
};
const c=createCollector({freeze,artifactBytes:p=>fs.readFileSync(ROOT+'/'+p),checkpoint:raw+'/checkpoint.json',tokenExpiresAt:Date.now()+3600000,rehearsal:true,transport});
(async()=>{
    if(process.env.POT_FAKE_PARTIAL==='1'){
        const h=setup(),host=modelHost(c,'L','detached/J01',h);
        host.setTurn(1);
        await host.turn(journeys.journeys[0].query);
        c.close();
        atomic(raw+'/partial.json',{timing:host.timing.snapshot(),records:c.state().records.length,transport_calls:transportCalls,model_calls:0});
        return;
    }
    for(const arm of ['L','P']){
        const result=await shoppingEpisode(c,arm,'detached/J01',journeys.journeys[0]);
        const prior=c.priorOutcome(arm,'detached/J01');
        if(prior)assert.deepEqual(result,prior,'Replay must preserve outcomes and all original latency observations.');
        else c.outcome(arm,'detached/J01',result);
    }
    c.close();
    const previous=fs.existsSync(raw+'/done.json')?JSON.parse(fs.readFileSync(raw+'/done.json')):null;
    const episodes=c.state().outcomes.filter(o=>o.id==='detached/J01');
    atomic(raw+'/done.json',{fake:true,run:(previous?.run||0)+1,transport_calls_this_run:transportCalls,records:c.state().records.length,completed_episodes:episodes.length,timings:Object.fromEntries(episodes.map(o=>[o.arm,o.result.latency_ms])),model_calls:0,real_tokens:0,real_spend_usd:0});
})().catch(error=>{c.close();process.stderr.write(String(error.message).slice(0,160)+'\n');process.exitCode=1;});
