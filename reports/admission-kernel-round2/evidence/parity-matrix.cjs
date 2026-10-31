'use strict';
const assert=require('node:assert/strict');
const {admit,validatePlan}=require('../../../src/lib/pokemon/admission.cjs');
const {routeChatText}=require('../../../src/lib/pokemon/chatTextIntent.cjs');
const {frames,intents}=require('../../admission-kernel/evidence/corpus.cjs');
const {fullwidth,finishAliases,releaseSample}=require('./probes.cjs');
const prefs={currency:'USD',budget_minor:100000,grade_company:'PSA',grade_value:'10'};
function context(language='en',field='select'){
  const current={id:'parity-workspace',version:3,result:{goal_question:'Find Pikachu cards',scope_filters:language?{language}:{},discovery:{languages:language?[language]:['ja','en'],task:'character_cards'},preferences:structuredClone(prefs),candidate_cards:[],next_step:{field}}};
  const doc={id:'parity-chat',version:7,languagePreference:language,messages:[]};
  const binding={owner:'offline-parity-owner',chatId:doc.id,stateVersion:doc.version,workspaceId:current.id,workspaceVersion:3,deadline:30000};
  return {current,doc,binding,now:()=>1000};
}
function modelCandidate(intent,text){
  // Deliberately direct, well-shaped model candidates exercise the kernel
  // even when the earlier model projector would itself hold the raw proposal.
  return {action:{search:{type:'ask',question:text},reply:{type:'reply',text},refine_language:{type:'refine',scope:{language:'en'}},preferences:{type:'preferences',preferences:{currency:'USD',budget_minor:5000}},status:{type:'recommendation_status'},explain:{type:'model_explanation',key:'current_results'},clarify:{type:'model_clarification',field:'task',reason:'uncertain'},unsupported:{type:'model_explanation',key:'capability_scope'}}[intent]};
}
function runMatrix(){
  const releases=releaseSample();assert.equal(releases.length,20);
  const aliases=[...finishAliases.map(alias=>({kind:'finish',alias})),...releases.map(row=>({kind:'release',alias:row.alias}))];
  let cells=0,held=0;const uniqueTexts=new Set(),uniqueNormalizedTexts=new Set(),uniqueEffectiveCells=new Set(),uniqueNormalizedCells=new Set();
  const normalizeStrings=value=>typeof value==='string'?value.normalize('NFKC'):Array.isArray(value)?value.map(normalizeStrings):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,v])=>[key,normalizeStrings(v)])):value;
  for(const alias of aliases)for(let f=0;f<frames.length;f++)for(const width of ['ascii','fullwidth']){
    const original=frames[f](alias.alias),text=width==='fullwidth'?fullwidth(original):original;
    uniqueTexts.add(text);uniqueNormalizedTexts.add(text.normalize('NFKC'));
    for(const intent of intents)for(const modelEnabled of [false,true])for(const ingress of ['text','typed_ask','typed_reply']){
      const ctx=context(),candidate=ingress==='typed_ask'?{action:{type:'ask',question:text}}:ingress==='typed_reply'?{action:{type:'reply',text}}:modelEnabled?modelCandidate(intent,text):routeChatText(text,ctx.current,ctx.doc);
      const plan=admit({...ctx,candidate,text,ingress:ingress==='text'?'text':'typed'});
      const label=[alias.kind,alias.alias,f,width,intent,modelEnabled,ingress].join('/');
      assert.ok(plan.hold,'non-positive finish/release frame escaped: '+label+' '+JSON.stringify(plan));
      assert.equal(plan.localOnly,true,'held frame cannot acquire native authority: '+label);
      validatePlan(plan,ctx.binding,{now:ctx.now});held++;cells++;
      uniqueEffectiveCells.add(JSON.stringify([text,ingress,candidate]));
      uniqueNormalizedCells.add(JSON.stringify(normalizeStrings([text,ingress,candidate])));
    }
  }
  return {frames:frames.length,finish_aliases:finishAliases,releases,ascii_and_fullwidth:true,intents,model_modes:['off','on_fixture_candidate'],ingresses:['text','typed_ask','typed_reply'],executed_cells:cells,held_cells:held,unique_raw_texts:uniqueTexts.size,unique_nfkc_texts:uniqueNormalizedTexts.size,unique_effective_cells:uniqueEffectiveCells.size,repeated_effective_cells:cells-uniqueEffectiveCells.size,unique_nfkc_effective_cells:uniqueNormalizedCells.size,repeated_nfkc_effective_cells:cells-uniqueNormalizedCells.size,model_calls:0,method:'All logical cells execute. Disabled-model intent labels repeat the deterministic route; typed ingress does not use the model. Unique effective cells deduplicate text, ingress and the candidate actually passed to admission; NFKC counts additionally merge width-equivalent strings in text and candidate. Server ingress only permits record IDs and is separately tested.'};
}
module.exports={runMatrix,context,modelCandidate,prefs};
