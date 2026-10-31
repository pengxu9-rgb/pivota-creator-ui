'use strict';
const assert=require('node:assert/strict');
const {admit,validatePlan}=require('../../../src/lib/pokemon/admission.cjs');
const {createModelTurnRouter}=require('../../../src/lib/pokemon/modelTurn.cjs');
const {routeChatText}=require('../../../src/lib/pokemon/chatTextIntent.cjs');
const {frames,intents}=require('../../admission-kernel/evidence/corpus.cjs');
const {context,modelCandidate,prefs}=require('../../admission-kernel-round2/evidence/parity-matrix.cjs');
const {fullwidth}=require('./probes.cjs'),{subjects}=require('./identity-oracle.cjs');
const normalizeStrings=value=>typeof value==='string'?value.normalize('NFKC'):Array.isArray(value)?value.map(normalizeStrings):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,normalizeStrings(v)])):value;
function runMatrix(){
  assert.equal(frames.length,40);
  const aliases=[...subjects.map(s=>({kind:'subject',alias:s.name})),{kind:'title_suffix',alias:'ex'}];
  let cells=0,held=0;const raw=new Set(),normalized=new Set(),effective=new Set(),nfkcEffective=new Set();
  for(const {kind,alias} of aliases)for(let frame=0;frame<frames.length;frame++)for(const width of ['ascii','fullwidth']){
    const original=frames[frame](alias),text=width==='fullwidth'?fullwidth(original):original;
    raw.add(text);normalized.add(text.normalize('NFKC'));
    for(const intent of intents)for(const modelEnabled of [false,true])for(const ingress of ['text','typed_ask','typed_reply']){
      const ctx=context(),candidate=ingress==='typed_ask'?{action:{type:'ask',question:text}}:ingress==='typed_reply'?{action:{type:'reply',text}}:modelEnabled?modelCandidate(intent,text):routeChatText(text,ctx.current,ctx.doc);
      const plan=admit({...ctx,candidate,text,ingress:ingress==='text'?'text':'typed'}),label=[kind,alias,frame,width,intent,modelEnabled,ingress].join('/');
      assert.ok(plan.hold,'non-positive subject/suffix frame escaped: '+label+' '+JSON.stringify(plan));assert.equal(plan.localOnly,true,label);
      validatePlan(plan,ctx.binding,{now:ctx.now});cells++;held++;
      effective.add(JSON.stringify([text,ingress,candidate]));nfkcEffective.add(JSON.stringify(normalizeStrings([text,ingress,candidate])));
    }
  }
  return {frames:frames.length,subjects:subjects.map(s=>s.name),subject_count:subjects.length,brief_subject_count:16,subject_count_note:'The checked-in SUBJECT/POSITIVE_SUBJECT lexicon contains 17 English subjects (Mew and Mewtwo are distinct). All 17 are covered, plus ex.',title_suffixes:['ex'],ascii_and_fullwidth:true,intents,model_modes:['off','on_fixture_candidate'],ingresses:['text','typed_ask','typed_reply'],executed_cells:cells,held_cells:held,unique_raw_texts:raw.size,unique_nfkc_texts:normalized.size,unique_effective_cells:effective.size,repeated_effective_cells:cells-effective.size,unique_nfkc_effective_cells:nfkcEffective.size,repeated_nfkc_effective_cells:cells-nfkcEffective.size,method:'Every logical cell executes. Disabled-model intent labels and typed ingress repeat candidates; effective-cell counts deduplicate the actual text, ingress and candidate. A separate slice below calls the real model router.'};
}
async function runModelRouterSlice(){
  let cells=0,held=0,modelCalls=0;const rows=[];
  // Three distinct frame classes: exclusion, exception, and quoted example.
  for(const alias of [...subjects.map(s=>s.name),'ex'])for(const frame of [0,13,16])for(const width of ['ascii','fullwidth'])for(const intent of intents){
    const original=frames[frame](alias),text=width==='fullwidth'?fullwidth(original):original,ctx=context();
    const router=createModelTurnRouter({interpret:async input=>{
      modelCalls++;return {schema:'pokemon.interpret-turn.v1',state_version:input.state_version,intent,source_spans:[],explanation_key:intent==='explain'?'current_results':'none',clarification_field:intent==='clarify'?'task':'none'};
    }});
    const candidate=await router({text,current:ctx.current,doc:ctx.doc});
    // A refine-language proposal has no honest language span in these subject
    // frames. The real projector must reject it; the other seven proposals
    // are structurally valid fixture interpretations.
    assert.equal(candidate.modelMeta?.status,intent==='refine_language'?'invalid':'accepted','actual router fixture status');
    const plan=admit({...ctx,candidate,text,ingress:'text'});
    assert.ok(plan.hold,JSON.stringify({alias,frame,width,intent,candidate}));assert.equal(plan.localOnly,true);
    validatePlan(plan,ctx.binding,{now:ctx.now});cells++;held++;
    rows.push({alias,frame,width,intent,fixture_status:candidate.modelMeta.status,projected_action:candidate.action.type,hold:plan.hold});
  }
  return {actual_createModelTurnRouter:true,frame_indices:[0,13,16],intents,widths:['ascii','fullwidth'],ingress:'text',executed_cells:cells,held_cells:held,fixture_model_calls:modelCalls,live_model_calls:0,interpretation_status_counts:Object.fromEntries(['accepted','invalid','unavailable'].map(status=>[status,rows.filter(row=>row.fixture_status===status).length])),rows};
}
module.exports={runMatrix,runModelRouterSlice,context,modelCandidate,prefs};
