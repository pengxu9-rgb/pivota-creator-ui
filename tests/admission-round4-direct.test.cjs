'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
const {admit,validatePlan}=require('../src/lib/pokemon/admission.cjs');
const {routeChatText}=require('../src/lib/pokemon/chatTextIntent.cjs');
const {createModelTurnRouter}=require('../src/lib/pokemon/modelTurn.cjs');
const {createConversationService}=require('../src/lib/pokemon/conversations.cjs');
const {frames}=require('../reports/admission-kernel/evidence/corpus.cjs');
const {context}=require('../reports/admission-kernel-round3/evidence/parity-matrix.cjs');
const {subjects}=require('../reports/admission-kernel-round3/evidence/identity-oracle.cjs');
const {fullwidth}=require('../reports/admission-kernel-round3/evidence/probes.cjs');

const copy=structuredClone;
const widths=text=>[text,fullwidth(text)];
function held(plan,label){
  assert.ok(plan.hold,label+' must hold before dispatch');
  assert.equal(plan.localOnly,true,label+' must not acquire native authority');
}
function typed(text,type='ask'){
  return {action:type==='ask'?{type,question:text}:{type,text}};
}
function literalFrames(){
  assert.equal(frames.length,40);
  const rows=[];
  for(const stem of ['a valuable card','Lucario'])for(let index=0;index<frames.length;index++){
    // Keep the original frame's subject fixed and place the literal in its
    // excluded/quoted slot, exactly as in the prior subject matrix.
    rows.push({stem,index,placement:'excluded_literal',text:frames[index](stem)});
    // Also make the exception itself the search target. This reaches the
    // valuable-card prefix guard, rather than testing Charizard's guard again.
    const target=stem==='Lucario'?'Lucario cards':stem;
    rows.push({stem,index,placement:'literal_search_target',text:frames[index]('ex').replaceAll('Charizard cards',target).replaceAll('Charizard',stem)});
  }
  return rows;
}
const literalNegatives=[
  'Find a valuable card that is not Charizard',
  'Find a valuable card, not ex',
  'Find a valuable card other than Pikachu',
  'Find Lucario cards that are not ex',
  'Find Lucario cards, not ex',
  'Find Lucario cards other than Pikachu',
];

test('R4-1 valuable/Lucario literals: all 40 exclusion frames in both slots and widths hold at admission',t=>{
  let cells=0;
  const rows=[...literalFrames(),...literalNegatives.map(text=>({text,placement:'review_counterexample'}))];
  for(const row of rows)for(const text of widths(row.text))for(const ingress of ['text','typed_ask','typed_reply']){
    const ctx=context(),candidate=ingress==='text'?routeChatText(text,ctx.current,ctx.doc):typed(text,ingress==='typed_reply'?'reply':'ask');
    const plan=admit({...ctx,candidate,text,ingress:ingress==='text'?'text':'typed'});
    held(plan,JSON.stringify({row,text,ingress}));validatePlan(plan,ctx.binding,{now:ctx.now});cells++;
  }
  assert.equal(cells,996);assert.equal(attempts.length,0);
  t.diagnostic('996 admission cells: 40 frames × 2 literal stems × 2 placements, plus 6 explicit counterexamples; both widths and 3 ingresses');
});

test('R4-1 literal positives stay exact; the Lucario prefix mutant remains equivalent behind the raw-text guard',()=>{
  for(const raw of ['Find a valuable card','Find Lucario cards'])for(const text of widths(raw)){
    const ctx=context(),plan=admit({...ctx,candidate:typed(text),text,ingress:'typed'});
    assert.equal(plan.hold,null,text);assert.equal(plan.localOnly,false,text);
    assert.equal(plan.constraints.identity.subject,raw.includes('Lucario')?'Lucario':null);
  }
  // R4_lucario_prefix is equivalent: even a prefix match here cannot grant
  // explicitLegacySubject without the separate complete raw-text regex.
  for(const raw of ['Lucario','Find Lucario cards please','Find Lucario cards ex','Find Lucario cards not ex'])for(const text of widths(raw)){
    const ctx=context();held(admit({...ctx,candidate:typed(text),text,ingress:'typed'}),text);
  }
});

const confirmationWords=['yes','confirm','yes, that one','はい','确认','是'];
const narrowWords=[...confirmationWords,'holo','normal','reverse','reverse holo','4/102'];
const fields=['release','variant','set_code','number','select',null,'finish','collector_number','coordinates','confirm'];
function binds(word,field){
  if(confirmationWords.includes(word))return ['select','confirm'].includes(field);
  if(['holo','normal'].includes(word))return ['variant','finish'].includes(field);
  if(word==='4/102')return ['number','collector_number','coordinates'].includes(field);
  // reverse/reverse holo do not identify one finish in the generated native
  // vocabulary. A finish prompt alone does not resolve that ambiguity.
  return false;
}
function replyContext(field){
  const ctx=context('en',field);if(field===null)delete ctx.current.result.next_step;
  return ctx;
}
test('R4-1 final reply binding: every confirmation/narrow word needs its own prompt field, including absent fields',t=>{
  let cells=0,accepted=0;
  for(const word of narrowWords)for(const field of fields)for(const text of widths(word))for(const ingress of ['text','typed']){
    const ctx=replyContext(field),candidate=ingress==='text'?routeChatText(text,ctx.current,ctx.doc):typed(text,'reply');
    const plan=admit({...ctx,candidate,text,ingress}),label=JSON.stringify({word,field,text,ingress});
    if(binds(word,field)){
      assert.equal(plan.hold,null,label);assert.equal(plan.action.type,'reply',label);
      assert.equal(plan.action.text,word,label);accepted++;
    }else held(plan,label);
    cells++;
  }
  assert.equal(cells,440);assert.equal(accepted,76);assert.equal(attempts.length,0);
  t.diagnostic('440 direct reply cells: 11 words × 10 prompt states × 2 widths × text/typed; 76 bound replies, 364 holds');
});

const unsupportedForms=['V','VMAX','VSTAR','GX'];
const caseForms=form=>[...new Set([form.toUpperCase(),form.toLowerCase(),[...form].map((c,i)=>i%2?c.toLowerCase():c.toUpperCase()).join('')])];
test('R4-1 unsupported forms: every subject × V/VMAX/VSTAR/GX case and width holds with model off, actual search router and typed ask',async t=>{
  assert.equal(subjects.length,17);let cells=0,modelCalls=0;
  const router=createModelTurnRouter({interpret:async input=>{
    modelCalls++;return {schema:'pokemon.interpret-turn.v1',state_version:input.state_version,intent:'search',source_spans:[],explanation_key:'none',clarification_field:'none'};
  }});
  for(const subject of subjects)for(const form of unsupportedForms)for(const spelling of caseForms(form))for(const text of widths(`Find ${subject.name} ${spelling} cards`))for(const mode of ['model_off','fixture_search','typed_ask']){
    const ctx=context(),candidate=mode==='typed_ask'?typed(text):mode==='fixture_search'?await router({text,current:ctx.current,doc:ctx.doc}):routeChatText(text,ctx.current,ctx.doc);
    if(mode==='fixture_search')assert.equal(candidate.modelMeta.status,'accepted','fixture must reach admission as a valid search proposal');
    const plan=admit({...ctx,candidate,text,ingress:mode==='typed_ask'?'typed':'text'});
    held(plan,JSON.stringify({subject:subject.name,form,spelling,text,mode}));cells++;
  }
  assert.equal(cells,1122);assert.equal(modelCalls,374);assert.equal(attempts.length,0);
  t.diagnostic('1122 unsupported-form cells; 374 fixture interpretations through actual createModelTurnRouter; zero live model calls');
});

test('R4-1 EX normalization is a positive contract; removing case folding is stricter-only, not a new admission gap',()=>{
  for(const subject of subjects)for(const form of ['EX','Ex','ex'])for(const text of widths(`Find ${subject.name} ${form} cards`)){
    const ctx=context(),plan=admit({...ctx,candidate:typed(text),text,ingress:'typed'});
    assert.equal(plan.hold,null,text);assert.equal(plan.constraints.identity.subject,subject.name,text);
    assert.equal(plan.constraints.identity.form,'ex',text);
  }
  assert.equal(attempts.length,0);
});

// Seed a real persisted conversation and inject only the catalog workspace.
// The service itself performs routing, model projection, admission, hold state
// persistence and reopening. The fixture refuses unexpected catalog dispatch.
function serviceHarness(field='select',{searchModel=false}={}){
  const ctx=replyContext(field),owner={id:'round4-direct-owner'},ownerKey=createHash('sha256').update(owner.id).digest('hex');
  ctx.doc.id=randomUUID();ctx.current.id=randomUUID();ctx.current.version=3;
  Object.assign(ctx.doc,{createdAt:Date.now(),updatedAt:Date.now(),expiresAt:Date.now()+3600000,title:'Existing Pikachu search',workspaceId:ctx.current.id,pending:null,requiresReconfirmation:true});
  ctx.current.result.selection_allowed=false;ctx.current.needs_reconfirmation=true;ctx.current.saved_decision=null;
  const rows=new Map([[ownerKey+'/chats/'+ctx.doc.id,copy(ctx.doc)]]),calls=[];let modelCalls=0;
  const store={async get(o,k,id){return copy(rows.get(o+'/'+k+'/'+id)||null);},async put(o,k,id,v){rows.set(o+'/'+k+'/'+id,copy(v));},async list(o,k){return [...rows].filter(([key])=>key.startsWith(o+'/'+k+'/')).map(([,v])=>copy(v));},async delete(o,k,id){rows.delete(o+'/'+k+'/'+id);}};
  const workspace={async get(_context,id){assert.equal(id,ctx.current.id);return copy(ctx.current);},async start(){assert.fail('must not restart catalog');},async advance(_context,payload){calls.push(copy(payload.action));assert.fail('R4-1 hold escaped through conversation service: '+JSON.stringify(payload.action));},async save(){assert.fail('R4-1 hold cannot save a target');}};
  const interpretTurn=searchModel?createModelTurnRouter({interpret:async input=>{modelCalls++;return {schema:'pokemon.interpret-turn.v1',state_version:input.state_version,intent:'search',source_spans:[],explanation_key:'none',clarification_field:'none'};}}):undefined;
  const make=()=>createConversationService({workspace,authenticate:async value=>value,store,interpretTurn});
  return {owner,doc:ctx.doc,calls,service:make(),restore:make,modelCalls:()=>modelCalls};
}
async function serviceHold(h,text,ingress){
  const chat=ingress==='text'?await h.service.send(h.owner,{id:h.doc.id,version:h.doc.version,text}):await h.service.action(h.owner,{id:h.doc.id,version:h.doc.version,action:ingress==='typed_reply'?{type:'reply',text}:{type:'ask',question:text}});
  assert.equal(h.calls.length,0,text+' must not invoke native');
  assert.equal(chat.modelClarificationPending,true,text+' must persist the hold');
  assert.equal(chat.target,null,text+' must not acquire a target');
  const reopened=await h.restore().get(h.owner,{id:chat.id});
  assert.equal(reopened.modelClarificationPending,true,text+' hold must survive reopen');
  assert.equal(reopened.target,null);assert.equal(h.calls.length,0);
}
test('R4-1 literal exclusions hold through real service text and typed asks, including fixture search proposals and reopen',async t=>{
  let cells=0;
  for(const raw of literalNegatives)for(const text of widths(raw))for(const mode of ['model_off','fixture_search','typed_ask']){
    const h=serviceHarness('select',{searchModel:mode==='fixture_search'});
    await serviceHold(h,text,mode==='typed_ask'?'typed_ask':'text');
    assert.equal(h.modelCalls(),mode==='fixture_search'?1:0);cells++;
  }
  assert.equal(cells,36);assert.equal(attempts.length,0);t.diagnostic('36 real-service literal exclusion cases, no native dispatch');
});
test('R4-1 mismatched and absent-field replies hold through real service text and typed replies and reopen',async t=>{
  let cells=0;
  for(const word of narrowWords)for(const field of fields)if(!binds(word,field))for(const text of widths(word))for(const ingress of ['text','typed_reply']){
    await serviceHold(serviceHarness(field),text,ingress);cells++;
  }
  assert.equal(cells,364);assert.equal(attempts.length,0);t.diagnostic('364 real-service mismatched/absent-field reply cases, no native dispatch');
});
test('R4-1 unsupported forms hold through real service text, actual model-search fixture and typed asks',async t=>{
  let cells=0;
  for(const subject of ['Charizard','Pikachu'])for(const form of unsupportedForms)for(const text of widths(`Find ${subject} ${form} cards`))for(const mode of ['model_off','fixture_search','typed_ask']){
    const h=serviceHarness('select',{searchModel:mode==='fixture_search'});
    await serviceHold(h,text,mode==='typed_ask'?'typed_ask':'text');
    assert.equal(h.modelCalls(),mode==='fixture_search'?1:0);cells++;
  }
  assert.equal(cells,48);assert.equal(attempts.length,0);t.diagnostic('48 real-service unsupported-form cases, no native dispatch');
});
