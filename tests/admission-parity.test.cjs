'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {admit,nativeEcho}=require('../src/lib/pokemon/admission.cjs');
const {routeChatText}=require('../src/lib/pokemon/chatTextIntent.cjs');
const {probes,whitespaceProbes,moneyProbes,fullwidth,finishAliases,releaseSample,mustHold,positive}=require('../reports/admission-kernel-round2/evidence/probes.cjs');
const {runMatrix,context,modelCandidate,prefs}=require('../reports/admission-kernel-round2/evidence/parity-matrix.cjs');
function matchingResult(plan){
  const {scope,language,preferences}=plan.constraints;
  return {scope_filters:structuredClone(scope),discovery:{languages:language?[language]:['ja','en']},preferences:structuredClone(preferences),candidate_cards:[],selection_allowed:false};
}

test('P1-A/P1-B: 40 finish and sampled release frames × widths × 8 intents × model on/off × text/typed ask/typed reply all hold',t=>{
  const result=runMatrix();assert.equal(result.executed_cells,result.held_cells);assert.equal(attempts.length,0);
  t.diagnostic(JSON.stringify(result));
});

test('P1-A/P1-B/P2-C: every review probe has a held or exactly admitted first turn',()=>{
  assert.equal(probes.length,43);
  for(const probe of probes){
    const ctx=context(/Japanese/.test(probe.initial)?'ja':/English/.test(probe.initial)?'en':null);
    if(probe.prefs)ctx.current.result.preferences=structuredClone(probe.prefs);
    for(const ingress of ['text','typed_ask','typed_reply']){
      const text=probe.texts?.[0]||probe.text,candidate=ingress==='typed_ask'?{action:{type:'ask',question:text}}:ingress==='typed_reply'?{action:{type:'reply',text}}:probe.intent?modelCandidate(probe.intent,text):routeChatText(text,ctx.current,ctx.doc);
      const plan=admit({...ctx,candidate,text,ingress:ingress==='text'?'text':'typed'}),label=probe.source+'/'+probe.id+'/'+ingress;
      if(mustHold(probe))assert.ok(plan.hold,label+' must retain a hold');
      if(positive(probe))assert.equal(plan.hold,null,label+' positive control must execute');
      if(plan.hold)assert.equal(plan.localOnly,true,label+' hold must have no catalog authority');
      else if(!plan.localOnly)assert.equal(nativeEcho(plan,matchingResult(plan)),true,label+' admitted scope must have a matching echo');
    }
  }
  assert.equal(attempts.length,0);
});

test('P1-A: Python-native Unicode whitespace cannot hide master-ball or poke-ball negation from admission',()=>{
  const {intents}=require('../reports/admission-kernel/evidence/corpus.cjs');
  for(const {text} of whitespaceProbes)for(const intent of intents)for(const enabled of [false,true])for(const ingress of ['text','typed_ask','typed_reply']){
    const ctx=context('ja'),candidate=ingress==='typed_ask'?{action:{type:'ask',question:text}}:ingress==='typed_reply'?{action:{type:'reply',text}}:enabled?modelCandidate(intent,text):routeChatText(text,ctx.current,ctx.doc);
    const plan=admit({...ctx,candidate,text,ingress:ingress==='text'?'text':'typed'});
    assert.ok(plan.hold,JSON.stringify([text,intent,enabled,ingress])+' must hold');assert.equal(plan.localOnly,true);
  }
});

test('P2-C: Unicode decimal budgets and ja-prefixed number text cannot preserve prior USD1000/PSA10 through a search',()=>{
  const {intents}=require('../reports/admission-kernel/evidence/corpus.cjs');
  for(const {text} of moneyProbes)for(const intent of intents)for(const enabled of [false,true])for(const ingress of ['text','typed_ask','typed_reply']){
    const ctx=context('en'),candidate=ingress==='typed_ask'?{action:{type:'ask',question:text}}:ingress==='typed_reply'?{action:{type:'reply',text}}:enabled?modelCandidate(intent,text):routeChatText(text,ctx.current,ctx.doc);
    const plan=admit({...ctx,candidate,text,ingress:ingress==='text'?'text':'typed'});
    assert.ok(plan.hold,JSON.stringify([text,intent,enabled,ingress])+' must hold');assert.equal(plan.localOnly,true);
    assert.equal(plan.constraints.preferences.budget_minor,100000);assert.equal(plan.constraints.preferences.grade_value,'10');
  }
});

test('P1-A/P1-B: positive controls compile finish/release and normalized text before native dispatch',()=>{
  for(const raw of ['Find Charizard holo cards','Find Charizard cards only from Base Set','Find English Charizard holo cards'])for(const text of [raw,fullwidth(raw)]){
    const ctx=context(),plan=admit({...ctx,candidate:{action:{type:'ask',question:text}},text,ingress:'typed'});
    assert.equal(plan.hold,null,text);assert.equal(plan.action.type,'ask');assert.equal(plan.action.question,plan.action.question.normalize('NFKC'));
    if(/holo/.test(raw))assert.equal(plan.constraints.scope.variant,'holo');
    if(/Base Set/.test(raw))assert.equal(plan.constraints.scope.set_code,'BASE1');
    assert.equal(nativeEcho(plan,matchingResult(plan)),true);
  }
});

test('P1-A: finish and release bare replies require their matching next-step field',()=>{
  for(const [text,field] of [['holo','finish'],['non-holo','variant'],['Base Set','release']]){
    const ctx=context('en',field),plan=admit({...ctx,candidate:{action:{type:'reply',text}},text,ingress:'typed'});
    assert.equal(plan.hold,null,text+'/'+field);assert.equal(plan.action.type,'reply');
    assert.ok(plan.constraints.scope.variant||plan.constraints.scope.set_code,text+' must compile scope');
    for(const badField of ['number','select','character']){
      const wrong=context('en',badField),held=admit({...wrong,candidate:{action:{type:'reply',text}},text,ingress:'typed'});
      assert.ok(held.hold,text+'/'+badField+' must hold');
    }
  }
});

test('P2-C: bare numbers, comparison terms and grade words patch preferences or hold without stale-budget search',()=>{
  for(const fragment of ['50','50 or less','50 or under','50 tops','≤ 50','< 50','within 50','cheaper than 50','in a nine slab','ungraded raw copies only','mint','PSA9'])for(const raw of ['Find Charizard cards '+fragment,fragment])for(const text of [raw,fullwidth(raw)]){
    for(const intent of ['search','reply','preferences','status','explain']){
      const ctx=context(),plan=admit({...ctx,candidate:modelCandidate(intent,text),text,ingress:'text'});
      assert.ok(plan.hold||plan.action.type==='preferences','commercial signal ran stale search: '+text+'/'+intent);
      if(!plan.hold)assert.notDeepEqual(plan.action.preferences,prefs);
    }
  }
  // A collector fraction and a set code contain numbers but are not money.
  for(const text of ['Find Charizard SV03.5 006/165','Find Charizard 006/165']){
    const ctx=context(),plan=admit({...ctx,candidate:{action:{type:'ask',question:text}},text,ingress:'typed'});
    assert.equal(plan.hold,null,text);
  }
});

test('round2 does not loosen model-off bare-name, compound-preference or ISO-plus-symbol holds',()=>{
  for(const text of ['Lucario','Vaporeon','Find Charizard under USD 100','budget USD $100','budget JPY ¥10000']){
    const ctx=context(),candidate=routeChatText(text,ctx.current,ctx.doc),plan=admit({...ctx,candidate,text,ingress:'text'});
    assert.ok(plan.hold,text+' must retain its existing hold');
  }
});

test('P2-D: native echo rejects language narrowing and every unadmitted scope key in both directions',()=>{
  const ctx=context(null),text='Find Charizard cards',plan=admit({...ctx,candidate:{action:{type:'ask',question:text}},text,ingress:'typed'});
  assert.equal(plan.constraints.language,null);assert.equal(nativeEcho(plan,matchingResult(plan)),true);
  for(const languages of [['ja'],['en'],['en','ja'],[],null]){
    const result=matchingResult(plan);result.discovery.languages=languages;
    assert.throws(()=>nativeEcho(plan,result),/catalog_admission_echo_mismatch/,JSON.stringify(languages));
  }
  for(const [key,value] of [['language','en'],['variant','holo'],['set_code','BASE1'],['collector_number','006/165'],['unexpected_filter',true]]){
    const result=matchingResult(plan);result.scope_filters[key]=value;
    assert.throws(()=>nativeEcho(plan,result),/catalog_admission_echo_mismatch/,key);
  }
});

test('server record ingress cannot consume arbitrary finish/release prose or a fixture model proposal',()=>{
  const ctx=context('en'),id='en:BASE1:004/102:holo',candidate={action:{type:'inspect_record',card_id:id}};
  for(const text of ['Find Charizard cards without ＪＡＰＡＮＥＳＥ',...finishAliases,...releaseSample().map(r=>r.alias)]){
    const plan=admit({...ctx,candidate,text,ingress:'server'});
    assert.equal(plan.hold,null);assert.equal(plan.action.question,'Inspect catalog record '+id);
    assert.deepEqual(plan.constraints.recordIds,[id]);
    assert.equal(nativeEcho(plan,{scope_filters:{},discovery:{languages:['en']},preferences:structuredClone(prefs),candidate_cards:[{card_id:id,language:'en',set_code:'BASE1',collector_number:'004/102',variant:'holo'}],selection_allowed:true}),true);
  }
  assert.throws(()=>admit({...ctx,candidate:{action:{type:'ask',question:'Find Charizard holo cards'}},ingress:'server'}),/invalid_action/);
});
