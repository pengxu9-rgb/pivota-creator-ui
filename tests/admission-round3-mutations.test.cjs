'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {admit,extractSignals}=require('../src/lib/pokemon/admission.cjs');
const {context}=require('../reports/admission-kernel-round2/evidence/parity-matrix.cjs');

// These assertions exercise the exported completeness detector directly. The
// whole-text grammar is a second defense, so a held search alone would mask a
// deleted money/grade family and could not establish this independent contract.
const families={
  residual_digits:{key:'money',texts:['50ドル','50美元','50美金','50円','50元','50块','50usd','50bucks','50dollars','50k','50ish','10s','５０ドル','٥٠','٥٠ish','۵۰','५०']},
  cjk_comparisons:{key:'money',texts:['以下','以内','まで','未満','不超过','以下で']},
  english_comparisons:{key:'money',texts:['over ten','not over ten','no more than ten','capped at ten','cap ten','at most ten','max ten']},
  extended_symbols:{key:'money',texts:['≦ ten','＜ ten']},
  grade_wording:{key:'grade',texts:['slabbed','unslabbed','PSA 9s','PSA tens','PSA nines','NM','in tens','in nines']},
  cjk_numerals:{key:'money',texts:['五十ドル','五十美元','五十美金','五十円','五十元','五十块','五十usd','五十bucks','五十dollars','五十k','五十以下','十以下','两百美元','五十以内','五十まで','五十未満','五十不超过','五十以下で']},
};
for(const [family,{key,texts}] of Object.entries(families))test('R3-2 detector completeness: '+family,()=>{
  for(const raw of texts){
    const text=raw.normalize('NFKC');
    assert.equal(extractSignals(text)[key],true,key+' signal missing for '+JSON.stringify(raw));
  }
  assert.equal(attempts.length,0);
});

test('R3-2 numeric identity spans remain coordinates or printed set codes',()=>{
  for(const text of ['Charizard 006/165','Charizard SV03.5','Charizard ZZ999','Charizard ١٢/١٦٥']){
    // ASCII coordinates and printed codes have exact native identity syntax.
    // Other digit scripts are commercial unless a real identity span consumes
    // them, so the Arabic coordinate here must remain detected.
    assert.equal(extractSignals(text).money,text.includes('١'),text);
  }
});

test('R3-5 / R3-1: the whole-text positive grammar directly rejects subject and suffix negations',()=>{
  const texts=[
    'Find cards that are not Charizard','Find non-Charizard cards',
    "Find cards that aren\'t Charizard",'Find anything but Pikachu cards',
    'Show cards other than Pikachu','Find cards, no Mewtwo please',
    'ピカチュウ以外のカードを探して','Find Charizard cards that are not ex',
    'Find Charizard cards, no ex','Find Charizard cards not by Mitsuhiro Arita',
    'Find Charizard cards except ones by Ken Sugimori',
    'Find Charizard cards that are not holo','Find Charizard cards not from Base Set',
  ];
  for(const text of texts)for(const ingress of ['text','typed'])for(const type of ['ask','reply']){
    const action=type==='ask'?{type,question:text}:{type,text};
    const plan=admit({...context(),candidate:{action},text,ingress});
    assert.ok(plan.hold,JSON.stringify({text,ingress,type}));
    assert.equal(plan.localOnly,true,text);
    assert.equal(plan.action.type,'model_clarification',text);
  }
  for(const text of ['Find Charizard ex cards','Find Pikachu cards']){
    const plan=admit({...context(),candidate:{action:{type:'ask',question:text}},text,ingress:'typed'});
    assert.equal(plan.hold,null,text);assert.equal(plan.localOnly,false,text);
  }
  assert.equal(attempts.length,0);
});


test('identity completeness: a printed code inside a collector fraction cannot hide a second independent set signal',()=>{
  for(const text of ['Find Charizard ZZ999 006/XX999','Find Charizard ZZ999 006/xx998']){
    assert.equal(extractSignals(text).sets.length,2,text);
    for(const ingress of ['text','typed'])for(const type of ['ask','reply']){
      const action=type==='ask'?{type,question:text}:{type,text};
      const plan=admit({...context(),candidate:{action},text,ingress});
      assert.equal(plan.hold?.field,'compound',text+' must retain both identities or hold');
      assert.equal(plan.localOnly,true,text);
    }
  }
  const text='Find Charizard ZZ999 006/165';
  const positive=admit({...context(),candidate:{action:{type:'ask',question:text}},text,ingress:'typed'});
  assert.equal(positive.hold,null,text);
  assert.equal(positive.constraints.scope.set_code,'ZZ999');
  assert.equal(positive.constraints.scope.collector_number,'006/165');
  assert.equal(attempts.length,0);
});
