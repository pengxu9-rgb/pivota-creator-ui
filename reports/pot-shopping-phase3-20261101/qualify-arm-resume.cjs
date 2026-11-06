'use strict';
// Metadata-only resume fixtures use projected, previously recorded fake outcomes.
// Full corpus/scoring qualification remains a separate gate.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Module=require('node:module');
const ROOT=fs.realpathSync(process.cwd()),OUT=path.resolve(process.argv[2]),seed=JSON.parse(fs.readFileSync(process.argv[3],'utf8')),draft=process.argv[4];
assert.equal(seed.rehearsal,true,'fake_seed_only');
assert.ok(!OUT.startsWith(ROOT+path.sep),'external_output_required');
fs.mkdirSync(OUT,{recursive:true});
const relative='reports/pot-shopping-phase3-20261101/orchestrate.cjs',filename=ROOT+'/'+relative;
let runner;
if(draft){const m=new Module(filename,module);m.filename=filename;m.paths=Module._nodeModulePaths(path.dirname(filename));m._compile(fs.readFileSync(draft,'utf8'),filename);runner=m.exports;}
else runner=require(filename);
const {createCollector,checkFreeze}=require(ROOT+'/src/lib/pokemon/shopping/model/collector.cjs');
const {hash}=require(ROOT+'/src/lib/pokemon/shopping/schema.cjs');
const freeze=require(ROOT+'/reports/pot-shopping-phase3-20261101/freeze.json');
const freezeHash=checkFreeze(freeze,p=>fs.readFileSync(ROOT+'/'+p));
const pending=new Set(['journey/J02/1','journey/J03/1','journey/J04/1']);
function makeFixture(pref,includeP=false){
    const s=structuredClone(seed);
    s.freeze_sha256=freezeHash;s.rehearsal=true;s.stop_reason=null;s.signals=[];s.resume_history=[];s.sessions={};
    s.outcomes=s.outcomes.filter(o=>(includeP||o.arm==='L')&&o.id!=='arm_finished'&&!o.id.startsWith('model_turn/')&&!(o.arm==='L'&&pending.has(o.id))).map(o=>({arm:o.arm,id:o.id,result:{fixture_completed:true,completed:o.result.completed===true,compatibility_record:o.result.compatibility_record?{turn_id:o.result.compatibility_record.turn_id,pass:o.result.compatibility_record.pass}:undefined}}));
    s.records=s.records.filter(r=>r.arm==='L'&&r.id.startsWith('journey/J01/1/call-'));
    for(const arm of ['L','P']){const records=s.records.filter(r=>r.arm===arm);s.arms[arm]={calls:records.length,input_tokens:records.reduce((n,r)=>n+r.input_tokens,0),output_tokens:records.reduce((n,r)=>n+r.output_tokens,0),thought_tokens:records.reduce((n,r)=>n+r.thought_tokens,0),usd:records.reduce((n,r)=>n+r.estimated_usd,0),reserved_input:0,reserved_usd:0,without_tls:0,tls_timeouts:0,rate_limits:0,stop_reason:null,preflight:arm==='L'?pref:includeP};}
    return s;
}
function open(file,stats){
    let c;
    c=createCollector({freeze,artifactBytes:p=>fs.readFileSync(ROOT+'/'+p),checkpoint:file,tokenExpiresAt:Date.now()+3600000,rehearsal:true,transport:async({arm,request})=>{
        stats.transport_calls++;stats.active++;
        if(!c.state().arms[arm].preflight)stats.max_before_preflight=Math.max(stats.max_before_preflight,stats.active);
        else stats.max_after_preflight=Math.max(stats.max_after_preflight,stats.active);
        await new Promise(resolve=>setTimeout(resolve,5));
        const first=JSON.parse(request.contents[0].parts[0].text),continued=request.contents.some(p=>p.role==='model');
        const parts=continued?[{text:'{"decision":"search","fields":[],"claims":[]}'}]:[{functionCall:{name:'search_catalog',args:{task_ref:first.task_ref,text:first.text}}}];
        stats.active--;
        return {status:200,tls_connected:true,stage_reached:'http_status',body:{usageMetadata:{promptTokenCount:100,candidatesTokenCount:10,thoughtsTokenCount:2},candidates:[{finishReason:'STOP',content:{parts}}]}};
    }});
    return c;
}
const stats=()=>({transport_calls:0,active:0,max_before_preflight:0,max_after_preflight:0});
const rows=[];
(async()=>{
    for(const reason of ['received_SIGINT','received_SIGTERM','token_refresh_needed'])for(const pref of [false,true]){
        const id=reason+'-'+pref,file=OUT+'/'+id+'.json',initial=makeFixture(pref),counts=stats();
        fs.writeFileSync(file,JSON.stringify(initial));
        let c=open(file,counts),fired=false;
        const wrapped={...c,priorOutcome:(arm,key)=>{
            if(!fired&&arm==='L'&&key==='journey/J01/1'){
                fired=true;
                if(reason==='received_SIGINT')process.emit('SIGINT');
                else if(reason==='received_SIGTERM')process.emit('SIGTERM');
                else c.stop(reason);
            }
            return c.priorOutcome(arm,key);
        }};
        await runner.runArm(wrapped,'L');
        assert.equal(fired,true);assert.equal(c.state().stop_reason,reason);assert.equal(counts.transport_calls,0);
        assert.equal(c.priorOutcome('L','arm_finished'),null,'Transient shutdown cannot publish a terminal marker.');
        await runner.runArm(c,'P');assert.equal(counts.transport_calls,0,'P cannot run during global shutdown.');c.close();
        c=open(file,counts);
        assert.equal(c.state().stop_reason,null);
        await assert.rejects(runner.runArm(c,'P'),/L_arm_must_finish_first/);
        const oldKeys=initial.records.map(r=>r.arm+'/'+r.id+'/'+r.attempt);
        await runner.runArm(c,'L');
        assert.deepEqual(c.priorOutcome('L','arm_finished'),{status:'completed'});
        assert.ok(c.state().arms.L.preflight);
        if(!pref)assert.equal(counts.max_before_preflight,1,'First pending normal call qualifies before concurrency2.');
        assert.ok(counts.max_after_preflight>=2,'Concurrency2 is allowed only after qualification.');
        const beforeRepeat=counts.transport_calls;
        await runner.runArm(c,'L');
        assert.equal(counts.transport_calls,beforeRepeat);
        assert.equal(c.state().outcomes.filter(o=>o.arm==='L'&&o.id==='arm_finished').length,1);
        for(const key of oldKeys)assert.equal(c.state().records.filter(r=>r.arm+'/'+r.id+'/'+r.attempt===key).length,1);
        c.close();rows.push({reason,preflight_before_stop:pref,terminal_marker_created_only_after_resume:true,P_blocked_while_incomplete:true,no_completed_HTTP_repeated:true,...counts});
    }
    for(const [label,reason]of [['401','access_denied'],['403','access_denied'],['transport','transport_unreachable']]){
        const file=OUT+'/global-'+label+'.json',fixture=makeFixture(true,true),counts=stats();
        fixture.stop_reason=reason;fixture.outcomes.push({arm:'L',id:'arm_finished',result:{status:'completed'}});
        fs.writeFileSync(file,JSON.stringify(fixture));const c=open(file,counts);
        await runner.runArm(c,'P');assert.equal(counts.transport_calls,0);assert.equal(c.priorOutcome('P','arm_finished'),null);c.close();rows.push({global_stop:label,P_prevented:true,transport_calls:0});
    }
    const file=OUT+'/unavailable.json',fixture=makeFixture(true,true),counts=stats();fixture.arms.L.stop_reason='model_unavailable';
    fs.writeFileSync(file,JSON.stringify(fixture));const c=open(file,counts);
    await runner.runArm(c,'L');assert.deepEqual(c.priorOutcome('L','arm_finished'),{status:'arm_stopped',reason:'model_unavailable'});
    await runner.runArm(c,'P');assert.deepEqual(c.priorOutcome('P','arm_finished'),{status:'completed'});assert.equal(counts.transport_calls,0);c.close();
    rows.push({permanent_unavailable_L_allows_P:true,transport_calls:0});
    const result={schema:'shopping.phase3.arm-resume-qualification.v1',passed:true,draft:!!draft,fixture_projection:true,source_sha256:hash(fs.readFileSync(draft||filename,'utf8')),seed_rehearsal:true,real_calls:0,rows};
    fs.writeFileSync(OUT+'/result.json',JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify({passed:true,cases:rows.length,draft:!!draft,real_calls:0})+'\n');
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
