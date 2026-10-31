'use strict';
// No network: derive a C-turn's actual state by replaying its already recorded
// predecessors through the real conversation/private workspace in memory.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {buildModelInput}=require('../../src/lib/pokemon/modelTurn.cjs');
const {routeChatText}=require('../../src/lib/pokemon/chatTextIntent.cjs');
const {admit}=require('../../src/lib/pokemon/admission.cjs');
const {createFixture,binding,planView,FIXED_NOW}=require('./offline-fixture.cjs');
const copy=value=>structuredClone(value),sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,JSON.parse(canonical(value[k]))])):value);
const equal=(left,right)=>canonical(left)===canonical(right);
function modelOff(text,context){
  const candidate=routeChatText(text,context.current,context.doc);
  const plan=admit({...context,text,candidate,ingress:'text',binding:binding(context),now:()=>FIXED_NOW});
  return {candidate:copy(candidate),plan:planView(plan),clarified:!!plan.hold||['language_clarification','model_clarification'].includes(plan.action.type)};
}
function controller(corpus){
  const byId=new Map(corpus.entries.map(entry=>[entry.id,entry]));
  assert.equal(byId.size,corpus.entries.length,'unique corpus IDs');
  async function contextFor(entry,pass,records){
    assert.ok([1,2].includes(pass));assert.ok(byId.has(entry.id));assert.ok(Array.isArray(records));
    if(!entry.sets.includes('C'))return {context:copy(entry.context),model_off:modelOff(entry.text,entry.context),provenance:{mode:'frozen_non_C'}};
    assert.equal(entry.sets.length,1,'dynamic C rows must not alias other frozen sets');
    const map=new Map();for(const record of records){if(record.pass!==pass)continue;const id=record.turn_id||record.id;assert.ok(!map.has(id),'duplicate predecessor proposal');map.set(id,record);}
    const occurrences=[];
    for(const flow of corpus.flows)for(const [targetIndex,operation]of flow.operations.entries())if(operation.entry_id===entry.id)occurrences.push({flow,targetIndex});
    assert.ok(occurrences.length,'C row needs a source flow occurrence');
    const derived=[];
    for(const {flow,targetIndex}of occurrences){
      const trace=[];let activeRecord=null,seenInput=null;
      const fixture=createFixture({interpret:async input=>{
        assert.ok(activeRecord,'predecessor record must be selected before interpretation');seenInput=copy(input);
        if(activeRecord.error_code)throw Object.assign(Error(activeRecord.error_code),{code:activeRecord.error_code});
        return copy(activeRecord.proposal);
      }});
      let unreachable=null;
      for(let index=0;index<targetIndex;index++){
        const op=flow.operations[index],before=fixture.snapshot(),calls=fixture.calls.length,writes=fixture.writes;let error=null;
        if(op.entry_id){
          const prior=map.get(op.entry_id),source=byId.get(op.entry_id);
          if(!prior||prior.not_run||prior.unreachable||prior.error_code==='not_run'){
            unreachable={reason:prior?'predecessor_unreachable':'predecessor_not_recorded',operation:index,turn_id:op.entry_id};break;
          }
          assert.ok(source,'known predecessor row');
          const input=buildModelInput({...before,text:source.text}),inputHash=sha(JSON.stringify(input));
          if(prior.input_sha256!==inputHash||prior.context&&!equal(prior.context,before)){
            unreachable={reason:'predecessor_actual_context_mismatch',operation:index,turn_id:op.entry_id,expected_input_sha256:inputHash,recorded_input_sha256:prior.input_sha256};break;
          }
          if(op.operation==='inject'){
            // The measured proposal is a probe against this predecessor state.
            // The raw source history is then imported as a legacy fixture;
            // sending it would turn it into a different new user operation.
            if(!before.current){unreachable={reason:'legacy_injection_requires_live_created_workspace',operation:index,turn_id:op.entry_id};break;}
            try{fixture.inject(op.action);}catch(e){unreachable={reason:'legacy_injection_unavailable',operation:index,code:e.code||e.message};break;}
          }else{
            activeRecord=prior;seenInput=null;
            try{await fixture.send(source.text);}catch(e){error=e.code||e.message;}
            if(seenInput&&!equal(seenInput,input)){
              unreachable={reason:'service_model_input_mismatch',operation:index,turn_id:op.entry_id};break;
            }
          }
        }else if(op.operation==='inject'){
          if(!before.current){unreachable={reason:'legacy_injection_requires_live_created_workspace',operation:index};break;}
          try{fixture.inject(op.action);}catch(e){unreachable={reason:'legacy_injection_unavailable',operation:index,code:e.code||e.message};break;}
        }else if(op.operation==='typed'){
          try{await fixture.action(op.action);}catch(e){error=e.code||e.message;}
        }else{
          unreachable={reason:'source_operation_has_no_recorded_text_proposal',operation:index};break;
        }
        trace.push({operation:index,kind:op.operation,turn_id:op.entry_id||null,error,dispatches:fixture.calls.length-calls,workspace_writes:fixture.writes-writes});
      }
      const actual=fixture.snapshot(),target=flow.operations[targetIndex];
      if(!unreachable&&target.operation==='inject'&&!actual.current)unreachable={reason:'legacy_injection_requires_live_created_workspace',operation:targetIndex,turn_id:entry.id};
      derived.push({flow_id:flow.id,source_file:flow.source_file,source_id:flow.source_id,operation:targetIndex,trace,
        ...(unreachable?{unreachable}:{context:actual,context_sha256:sha(canonical(actual))})});
    }
    const provenance={mode:'actual_recorded_model_predecessors',pass,recipe:'Actual source initial/text predecessors use service.send with recorded proposal/error. Source typed buttons bridge offline. An injected-text proposal is measured without mutating the service, then its original raw turn is imported as a legacy-history fixture. No model-off fallback seed.',
      occurrences:derived.map(({context,...rest})=>rest)};
    if(derived.some(row=>row.unreachable))return {unreachable:true,reason:derived.some(row=>!row.unreachable)?'deduplicated_occurrence_reachability_conflict':derived[0].unreachable.reason,provenance};
    const context=derived[0].context;
    if(!derived.every(row=>equal(row.context,context)))return {unreachable:true,reason:'deduplicated_occurrence_actual_context_conflict',provenance};
    return {context:copy(context),model_off:modelOff(entry.text,context),provenance};
  }
  return {contextFor};
}
let defaultController;
async function contextFor(entry,pass,records){
  if(!defaultController)defaultController=controller(JSON.parse(fs.readFileSync(path.join(__dirname,'corpus.json'),'utf8')));
  return defaultController.contextFor(entry,pass,records);
}
module.exports={controller,contextFor,modelOff,canonical};
