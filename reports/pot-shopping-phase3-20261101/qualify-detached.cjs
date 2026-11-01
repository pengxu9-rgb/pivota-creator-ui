'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),raw=path.resolve(process.argv[2]);fs.mkdirSync(raw,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(file,predicate){for(let i=0;i<100;i++){if(fs.existsSync(file)){const value=JSON.parse(fs.readFileSync(file));if(predicate(value))return value;}await delay(100);}throw Error('detached_fake_timeout');}
function launch(partial,name){const r=cp.spawnSync(process.execPath,[__dirname+'/detached-launch.cjs','--fake',raw],{cwd:root,env:{...process.env,POT_FAKE_PARTIAL:partial?'1':'0'},encoding:'utf8'});fs.writeFileSync(raw+'/'+name+'.log',r.stdout+'\n'+r.stderr);assert.equal(r.status,0);}
(async()=>{
    launch(true,'launch-partial');
    const partial=await wait(raw+'/partial.json',()=>true);
    assert.equal(partial.records,2);
    await delay(30);
    launch(false,'launch-resume');
    const first=await wait(raw+'/done.json',v=>v.run===1);
    assert.equal(first.completed_episodes,2);
    assert.equal(first.timings.L.first_useful,partial.timing.observations.first_useful);
    assert.equal(first.timings.L.qualified_offer,partial.timing.observations.qualified_offer);
    assert.ok(first.timings.L.complete_preview>=partial.timing.last_elapsed_ms);
    assert.ok(first.timings.L.complete_preview>=30,'Incomplete-session downtime must remain in preview latency.');
    assert.equal(first.transport_calls_this_run,first.records-partial.records);
    launch(false,'launch-completed-replay');
    const second=await wait(raw+'/done.json',v=>v.run===2);
    assert.equal(second.transport_calls_this_run,0);
    assert.equal(second.records,first.records);
    assert.deepEqual(second.timings,first.timings);
    process.stdout.write(JSON.stringify({detached:true,both_arms:true,partial_session_resumed:true,first_useful_and_qualified_preserved:true,preview_includes_downtime:true,completed_continuation_replayed_after_restart:true,duplicate_transport_calls:0,model_calls:0})+'\n');
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
