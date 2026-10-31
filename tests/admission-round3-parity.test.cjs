'use strict';
const {attempts}=require('./helpers/strict-network-guard.cjs');
const test=require('node:test'),assert=require('node:assert/strict');
const {admit,nativeEcho}=require('../src/lib/pokemon/admission.cjs');
const {routeChatText}=require('../src/lib/pokemon/chatTextIntent.cjs');
const {kernelProbes,probes,fullwidth,mustHold,positive}=require('../reports/admission-kernel-round3/evidence/probes.cjs');
const {context,modelCandidate,runMatrix,runModelRouterSlice}=require('../reports/admission-kernel-round3/evidence/parity-matrix.cjs');
const {subjects,candidateIdentityChecks}=require('../reports/admission-kernel-round3/evidence/identity-oracle.cjs');
const echo=plan=>({scope_filters:structuredClone(plan.constraints.scope),discovery:{languages:plan.constraints.language?[plan.constraints.language]:['ja','en']},preferences:structuredClone(plan.constraints.preferences),candidate_cards:[],selection_allowed:false});

test('R3-1/R3-3/R3-5: all 40 frames × complete subject lexicon plus ex × widths × intents × model modes × ingress hold',()=>{
  const result=runMatrix();assert.equal(result.executed_cells,subjects.length===17?69120:0);assert.equal(result.held_cells,result.executed_cells);assert.equal(attempts.length,0);
});

test('R3-3: a matrix slice passes fixture interpretations through actual createModelTurnRouter validation and projection',async()=>{
  const result=await runModelRouterSlice();assert.equal(result.actual_createModelTurnRouter,true);assert.equal(result.executed_cells,864);assert.equal(result.held_cells,result.executed_cells);assert.equal(result.fixture_model_calls,result.executed_cells);assert.equal(attempts.length,0);
});

test('R3-1/R3-2/R3-3: every minimal, A/M kernel, typed kernel and native review input is held or has an exact admitted echo',()=>{
  assert.equal(kernelProbes.length,64);assert.equal(probes.length,54);
  for(const probe of [...kernelProbes,...probes])for(const text of probe.texts||[probe.text])for(const ingress of ['text','typed_ask','typed_reply']){
    const lang=Object.hasOwn(probe,'lang')?probe.lang:/^Japanese/.test(probe.initial||'')?'ja':'en';
    const ctx=context(lang,probe.field??'select');if(probe.field===null)delete ctx.current.result.next_step;
    if(probe.prefs)ctx.current.result.preferences=structuredClone(probe.prefs);
    const candidate=probe.action?{action:probe.action}:ingress==='typed_ask'?{action:{type:'ask',question:text}}:ingress==='typed_reply'?{action:{type:'reply',text}}:probe.intent?modelCandidate(probe.intent==='recommend'?'clarify':probe.intent,text):routeChatText(text,ctx.current,ctx.doc);
    const plan=admit({...ctx,candidate,text,ingress:ingress==='text'?'text':'typed'}),label=[probe.source,probe.id,ingress,text].join('/');
    if(mustHold(probe))assert.ok(plan.hold,label+' must stop before dispatch');
    if(plan.hold)assert.equal(plan.localOnly,true,label+' hold cannot acquire native authority');
    else if(!plan.localOnly){assert.equal(nativeEcho(plan,echo(plan)),true,label);assert.ok(plan.constraints.identity,label+' every executable plan records admitted identity');}
  }
  assert.equal(attempts.length,0);
});

test('R3-1: positive Charizard ex and Pikachu grammar records subject/form while negated subject/suffix/illustrator holds',()=>{
  for(const [raw,subject,form] of [['Find Charizard ex cards','Charizard','ex'],['Find Pikachu cards','Pikachu',null],['Find Lucario cards','Lucario',null]])for(const text of [raw,fullwidth(raw)]){
    const ctx=context(),plan=admit({...ctx,candidate:{action:{type:'ask',question:text}},text,ingress:'typed'});
    assert.equal(plan.hold,null,text);assert.equal(plan.action.question,plan.action.question.normalize('NFKC'));assert.equal(plan.constraints.identity.form,form);
    const observed=plan.constraints.identity.subject;assert.equal(typeof observed==='object'?observed.canonicalName:observed,subject);
  }
  for(const text of ['Find non-Charizard cards',"Find cards that aren't Charizard",'Find anything but Pikachu cards','ピカチュウ以外のカードを探して','Find Charizard cards that are not ex','Find Charizard cards not by Mitsuhiro Arita','Lucario','Find non-Lucario cards','Find cards that are not Lucario','Find Lucario cards except Pikachu']){
    const ctx=context();for(const type of ['ask','reply'])assert.ok(admit({...ctx,candidate:{action:type==='ask'?{type,question:text}:{type,text}},text,ingress:'typed'}).hold,text+'/'+type);
  }
});

test('R3-1: raw positive text cannot mask a different forwarded ask or reply payload',()=>{
  const bad='Find cards that are not Charizard';
  for(const field of ['variant','select','confirmation'])for(const [raw,action] of [['yes',{type:'reply',text:bad}],['holo',{type:'reply',text:bad}],['Find Pikachu cards',{type:'ask',question:bad}]]){
    const ctx=context('en',field),plan=admit({...ctx,candidate:{action},text:raw,ingress:'text'});
    assert.ok(plan.hold||plan.localOnly||!(plan.action.question??plan.action.text??'').includes('not Charizard'),JSON.stringify({raw,action,plan}));
  }
});

test('R3-3: native candidate oracle detects hidden character or title suffix alongside variant/set checks',()=>{
  const plan={constraints:{identity:{subject:null,form:null}}};
  assert.throws(()=>candidateIdentityChecks(plan,[{name:'Charizard'}]),/unadmitted_character/);
  const charizard={constraints:{identity:{subject:'Charizard',form:null}}};
  assert.throws(()=>candidateIdentityChecks(charizard,[{name:'Charizard ex'}]),/unadmitted_title_suffix/);
  assert.throws(()=>candidateIdentityChecks(charizard,[{name:'Pikachu'}]),/differs_from_admitted_subject/);
  assert.equal(candidateIdentityChecks({constraints:{identity:{subject:'Charizard',form:'ex'}}},[{name:'リザードンex'}]).length,2);
  assert.equal(candidateIdentityChecks({constraints:{identity:{subject:'Pikachu',form:null}}},[{name:'ピカチュウ',official_metadata:{official:{dex_id:25}}}]).length,2);
  assert.equal(candidateIdentityChecks({constraints:{identity:{subject:'Lucario',form:null}}},[{name:'Lucario'},{name:'ルカリオ'}]).length,2);
});

const poolFixture=require('../reports/admission-kernel-round3/evidence/pool-proof-fixture.json');
const {validateProof,validatePool,digest}=require('../reports/admission-kernel-round3/evidence/pool-proof.cjs');
const poolPlan=()=>({action:{type:'ask',question:'Japanese Find Pikachu 精灵球 cards'},constraints:{language:'ja',scope:{language:'ja',variant:'reverse_pokeball'},identity:{subject:'Pikachu',form:null}}});
const poolOptions=()=>({plan:poolPlan(),cards:structuredClone(poolFixture.proof.pool.rows),field:'set_code',observed:'SV2A',provenance:poolFixture.proof.provenance});
test('R3 native pool oracle: complete admitted dex/language/variant pool entails SV2A without making it an explicit filter',()=>{
  const result=validateProof(poolFixture.proof,poolOptions());
  assert.equal(result.status,'entailed_by_complete_catalog_pool');assert.equal(result.explicitly_admitted,false);
  assert.equal(result.pool_count,1);assert.equal(result.pool_card_ids_sha256,'975b5a17dfde30c2c76dd16cadb70b3ffaa0bc13b7dbd5408942a10e4aa36ddb');
  assert.equal(Object.hasOwn(poolPlan().constraints.scope,'set_code'),false);
  assert.equal(poolFixture.audit.exit_code,0);assert.equal(poolFixture.audit.python_network_attempts,0);
});
test('R3 native pool oracle: removing admitted variant broadens to 130 records and 36 sets and cannot authorize SV2A',()=>{
  const counter=poolFixture.proof.counterfactuals.find(row=>row.omitted==='variant');
  assert.equal(counter.card_count,130);assert.equal(counter.values.set_code.length,36);assert.equal(counter.card_ids_sha256,'e1cde26f6ff78356f05522601a6a7bc1291192f19d6ebedb3c6658f3fa8364ef');
  const proof=structuredClone(poolFixture.proof),options=poolOptions();delete options.plan.constraints.scope.variant;
  proof.predicate=counter.predicate;proof.predicate_sha256=digest(proof.predicate);proof.pool=counter;proof.counterfactuals=[];
  assert.throws(()=>validateProof(proof,options),/does not entail/);
});
test('R3 native pool oracle: malformed, empty, mismatched, outside-pool and incomplete-page certificates fail closed',()=>{
  for(const change of [
    proof=>{delete proof.schema;},
    proof=>{proof.pool.card_count=0;proof.pool.rows=[];proof.pool.card_ids=[];proof.pool.card_ids_sha256=digest([]);},
    proof=>{proof.provenance.database_sha256='0'.repeat(64);},
    proof=>{proof.provenance.runtime_roster_sha256='0'.repeat(64);},
    proof=>{proof.pool.card_ids_sha256='0'.repeat(64);},
    proof=>{proof.counterfactuals=[];},
    proof=>{proof.counterfactuals.push(structuredClone(proof.counterfactuals[0]));},
    proof=>{proof.pool.rows[0].language='en';},
    proof=>{proof.pool.rows[0].variant='normal';},
  ]){const proof=structuredClone(poolFixture.proof);change(proof);assert.throws(()=>validateProof(proof,poolOptions()));}
  const outside=poolOptions();outside.cards[0].card_id='ja:SV2A:026/165:reverse_pokeball';assert.throws(()=>validateProof(poolFixture.proof,outside),/outside complete pool/);
  const incomplete=structuredClone(poolFixture.proof);incomplete.pool.rows.push({...incomplete.pool.rows[0],card_id:'ja:SV2A:026/165:reverse_pokeball'});incomplete.pool.card_ids=incomplete.pool.rows.map(row=>row.card_id);incomplete.pool.card_count=2;incomplete.pool.card_ids_sha256=digest(incomplete.pool.card_ids);
  assert.throws(()=>validateProof(incomplete,poolOptions()),/one page must be returned in full/);
});
test('R3 native pool oracle: independently reconstructed SQL rejects rehashed narrowing and parameter-only tampering',()=>{
  const crypto=require('node:crypto'),sqlHash=sql=>crypto.createHash('sha256').update(sql).digest('hex');
  const parameters=structuredClone(poolFixture.proof);parameters.pool.sql_parameters[0]=6;
  assert.throws(()=>validateProof(parameters,poolOptions()),/parameters must match/);
  const narrowed=structuredClone(poolFixture.proof);narrowed.pool.sql=narrowed.pool.sql.replace(' ORDER BY',' AND c.set_code=? ORDER BY');narrowed.pool.sql_parameters.push('SV2A');narrowed.pool.sql_sha256=sqlHash(narrowed.pool.sql);
  assert.throws(()=>validateProof(narrowed,poolOptions()),/SQL must be reconstructed/);
  const formPool=structuredClone(poolFixture.proof.pool);formPool.predicate.identity.form='ex';formPool.predicate_sha256=digest(formPool.predicate);
  const {expectedQuery}=require('../reports/admission-kernel-round3/evidence/pool-proof.cjs'),query=expectedQuery(formPool.predicate);formPool.sql=query.sql;formPool.sql_parameters=query.parameters;formPool.sql_sha256=sqlHash(query.sql);
  assert.throws(()=>validatePool(formPool),/outside admitted title form/);
});
