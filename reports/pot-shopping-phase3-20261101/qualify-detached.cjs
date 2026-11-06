'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {acquireRunLock}=require('./run-directory.cjs');
const root=path.resolve(__dirname,'../..'),raw=path.resolve(process.argv[2]);fs.mkdirSync(raw,{recursive:true});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(file,predicate){for(let i=0;i<100;i++){if(fs.existsSync(file)){const value=JSON.parse(fs.readFileSync(file));if(predicate(value))return value;}await delay(100);}throw Error('detached_fake_timeout');}
function launch(partial,name,expected=0){const r=cp.spawnSync(process.execPath,[__dirname+'/detached-launch.cjs','--fake',raw],{cwd:root,env:{...process.env,POT_FAKE_PARTIAL:partial?'1':'0'},encoding:'utf8'});fs.writeFileSync(raw+'/'+name+'.log',r.stdout+'\n'+r.stderr);assert.equal(r.status,expected,r.stderr);return r;}
async function waitUnlocked(){
    for(let i=0;i<100;i++){
        try { acquireRunLock(raw).close(); return; }
        catch(error){ if(error.message!=='run_directory_locked')throw error; }
        await delay(100);
    }
    throw Error('detached_lock_release_timeout');
}
(async()=>{
    const freezeSha=createHash('sha256').update(fs.readFileSync(__dirname+'/freeze.json')).digest('hex');
    const lock=acquireRunLock(raw);
    try {
        assert.match(launch(false,'launch-locked-node',1).stderr,/run_directory_locked/);
        const r=cp.spawnSync('python3',['-I','-B',__dirname+'/token-launch.py','--mode','fake','--arm','L',
            '--raw',raw,'--freeze-sha',freezeSha,'--plan','reduced','--fake-cache',raw+'/not-a-cache'],
        {cwd:root,encoding:'utf8'});
        fs.writeFileSync(raw+'/launch-locked-python.log',r.stdout+'\n'+r.stderr);
        assert.equal(r.status,1,r.stderr);
        assert.match(r.stderr,/^run_directory_locked$/m);
        assert.equal(fs.existsSync(raw+'/checkpoint.json'),false);
        assert.equal(fs.existsSync(raw+'/pid.json'),false);
    } finally {
        lock.close();
    }
    launch(true,'launch-partial');
    const partial=await wait(raw+'/partial.json',()=>true);
    assert.equal(partial.records,2);
    await delay(30);
    await waitUnlocked();
    launch(false,'launch-resume');
    const first=await wait(raw+'/done.json',v=>v.run===1);
    assert.equal(first.completed_episodes,2);
    assert.equal(first.timings.L.first_useful,partial.timing.observations.first_useful);
    assert.equal(first.timings.L.qualified_offer,partial.timing.observations.qualified_offer);
    assert.ok(first.timings.L.complete_preview>=partial.timing.last_elapsed_ms);
    assert.ok(first.timings.L.complete_preview>=30,'Incomplete-session downtime must remain in preview latency.');
    assert.equal(first.transport_calls_this_run,first.records-partial.records);
    await waitUnlocked();
    launch(false,'launch-completed-replay');
    const second=await wait(raw+'/done.json',v=>v.run===2);
    assert.equal(second.transport_calls_this_run,0);
    assert.equal(second.records,first.records);
    assert.deepEqual(second.timings,first.timings);
    process.stdout.write(JSON.stringify({detached:true,both_arms:true,shared_run_lock_rejected_both_launchers:true,partial_session_resumed:true,first_useful_and_qualified_preserved:true,preview_includes_downtime:true,completed_continuation_replayed_after_restart:true,duplicate_transport_calls:0,model_calls:0})+'\n');
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
