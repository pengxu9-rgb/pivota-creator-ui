'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const {readiness}=require('./sourceReadinessSamples.cjs');
const samples=require('./commerceSamples.cjs'),{exactListing}=require('./listingEvidenceSamples.cjs');
const {validateOffer}=require('../src/lib/pokemon/commerceContract.cjs');
const {canSelectForTarget,filterComparisonOffers,offerSection}=require('../src/lib/pokemon/offerEvidence.cjs');
const {handoffMatches}=require('../src/lib/pokemon/bnsChatState.cjs');
const anchor=samples.research().card_id,other='ja:SV2A:174/165:holo';
const clone=structuredClone;
function fresh(id='one',price=2000){return {...samples.offer(),offer_id:id,native_id:id,url:'https://jp.mercari.com/item/'+id,price_minor:price,observed_at:new Date(Date.now()-100).toISOString(),fresh_until:new Date(Date.now()+300000).toISOString()};}
function exact(id='one',price=2000,target=anchor){return exactListing(fresh(id,price),target);}
function candidateWithTarget(target=other){const o=exact('candidate',2000,target);delete o.card_id;o.identity_status='unverified_candidate';o.identity_evidence.status='candidate';o.identity_evidence.claims.edition=null;o.identity_evidence.matched_fields=o.identity_evidence.matched_fields.filter(f=>f!=='edition');o.identity_evidence.missing_fields=['edition'];return o;}

// The real hooks execute unchanged. Only React scheduling, navigation and IO
// are substituted; no service or provider can be contacted by this harness.
function runtime(relative,dependencies={}){
  const cells=[],effects=[],modules=new Map();let cursor=0,dirty=true,value;
  const hooks={
    useState(initial){const i=cursor++;if(!(i in cells))cells[i]={value:typeof initial==='function'?initial():initial};return[cells[i].value,next=>{cells[i].value=typeof next==='function'?next(cells[i].value):next;dirty=true;}];},
    useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
    useEffect(fn,deps){const i=cursor++,old=cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){cells[i]={deps,cleanup:old?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn();});}},
    useCallback(fn,deps){const i=cursor++,old=cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))cells[i]={deps,value:fn};return cells[i].value;}
  };
  function load(file){
    file=path.resolve(__dirname,'../src/components/creator/pokemon',file);if(modules.has(file))return modules.get(file).exports;
    const m={exports:{}};modules.set(file,m);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(code,{module:m,exports:m.exports,require(id){
      if(id==='react')return hooks;if(id in dependencies)return dependencies[id];
      if(id==='next/navigation')return{useRouter:()=>({replace(){}}),useSearchParams:()=>({get:()=>null})};
      if(id.startsWith('@/lib/'))return require(path.resolve(__dirname,'../src/lib',id.slice(6)));
      throw Error('Unexpected dependency '+id);
    },Date,AbortController,Set,Map,Error,crypto:require('node:crypto').webcrypto,setTimeout:()=>0,clearTimeout(){}});
    return m.exports;
  }
  const hook=load(relative).default;
  function render(){cursor=0;dirty=false;value=hook(dependencies.props);while(effects.length)effects.shift()();return value;}
  return {get value(){return value;},render,async settle(){for(let i=0;i<24;i++){if(dirty)render();await Promise.resolve();}if(dirty)render();return value;},dispose(){for(const c of cells)c?.cleanup?.();}};
}
function flowHarness(offers){
  const requests=[],research={...samples.research(),checked_at:new Date().toISOString(),offers,source_readiness:readiness()};
  const transport=async(operation,payload)=>{requests.push({operation,payload:clone(payload)});if(operation==='commerce/research')return research;if(operation==='commerce/select'){const offer=offers.find(o=>o.offer_id===payload.offer_id);return {...samples.selection(),expires_at:new Date(Date.now()+300000).toISOString(),offer:clone(offer)};}throw Error('Unexpected transport '+operation);};
  const h=runtime('live/useCommerceFlow.ts',{'../../pokemonClient':{pokemonApi:transport},props:{transport}});
  return {...h,get value(){return h.value;},requests,research,async researchOffers(){await h.settle();await h.value.researchOffers({card_id:anchor,query:'Pikachu',platforms:['mercari']});await h.settle();}};
}

test('wrong-target exact and candidate proofs cannot choose, select or hand off through the actual hook',async t=>{
  for(const offer of [exact('wrong',2000,other),candidateWithTarget()]){
    validateOffer(offer);assert.equal(offerSection(offer,Date.now(),undefined,anchor),'review');
    assert.equal(canSelectForTarget(offer,anchor),false);
    const h=flowHarness([offer]);t.after(()=>h.dispose());await h.researchOffers();const before=h.requests.length;
    h.value.chooseOffer(offer.offer_id);await h.settle();assert.equal(h.value.selectedOfferId,'');
    await h.value.selectOffer(offer.offer_id);await h.settle();assert.equal(h.requests.length,before,'wrong target must not reach selection transport');assert.equal(h.value.selection,null);
    await h.value.prepareHandoff();await h.settle();assert.equal(h.requests.length,before,'wrong target must not reach handoff transport');
  }
});

test('a selected offer that changes target cannot reuse its retained selection or reach handoff',async t=>{
  const offer=exact('selected'),h=flowHarness([offer]);t.after(()=>h.dispose());await h.researchOffers();
  await h.value.selectOffer(offer.offer_id);await h.settle();assert.equal(h.value.selection.offer.card_id,anchor);
  // Simulate an adversarial restored/updated observation sharing the old ID.
  Object.assign(offer,exact('selected',2000,other));h.render();const before=h.requests.length;
  await h.value.prepareHandoff();await h.settle();assert.equal(h.requests.length,before);assert.equal(h.value.selection,null);assert.equal(h.value.receipt,null);
});

test('target eligibility preserves explicit same-context candidate review and rejects certificate conflicts',()=>{
  const legacy=fresh(),same=candidateWithTarget(anchor),proven=exact();
  for(const o of [legacy,same,proven])assert.equal(canSelectForTarget(o,anchor),true);
  for(const target of ['',other,' '+anchor,anchor+' '])assert.equal(canSelectForTarget(proven,target),false);
  assert.equal(canSelectForTarget(proven,anchor,Date.now(),{status:'not_found'}),false);
  assert.equal(canSelectForTarget(proven,anchor,Date.now(),{comparison:{status:'mismatch'}}),false);
  const manual={...samples.handoff(),status:'manual_handoff_required',product_url:proven.url};delete manual.provider_result;
  assert.equal(handoffMatches(manual,proven,other,'buyship',{country:'HK'}),false);
  assert.equal(handoffMatches(manual,proven,anchor,'buyship',{country:'HK'}),true);
});

function mobileHarness(rows){
  const apiRequests=[],selectionCalls=[],flow={rows,research:{...samples.research(),offers:rows},running:{current:false},pending:'',error:'',country:'HK',region:'',grade:'',currency:'JPY',bindingKey:'fixture',selection:null,selectedOfferId:'',certificateResults:{},reset(){},setGrade(){},setCountry(){},setRegion(){},setError(message){flow.error=message;},async selectOffer(id){selectionCalls.push(id);flow.selectedOfferId=id;flow.selection={offer:rows.find(o=>o.offer_id===id)};}};
  const api=async(operation,payload)=>{apiRequests.push({operation,payload});if(operation==='bootstrap')return{synthetic_demo:false};if(operation==='bookmark-list'||operation==='chat-list')return[];throw Error('Unexpected API '+operation);};
  const h=runtime('shopper/useMobileAgent.ts',{'../../pokemonClient':{pokemonApi:api},'../live/useCommerceFlow':{__esModule:true,default:()=>flow},'../live/useConversationCommerce':{__esModule:true,default:()=>()=>{throw Error('Numeric choice must not invoke commerce transport');}}});
  return {...h,get value(){return h.value;},flow,apiRequests,selectionCalls};
}

test('numeric chat choices open the board without selecting from source order after sorting or filtering',async t=>{
  const a=exact('seller-a',12000),b=exactListing({...fresh('seller-b',11000),source:'snkrdunk',native_id:'67890',url:'https://snkrdunk.com/apparels/12345/used/67890'},anchor),sourceRows=[a,b];
  const sorted=filterComparisonOffers(sourceRows,{sort:'price'},anchor,Date.now()),filtered=filterComparisonOffers(sourceRows,{source:'snkrdunk'},anchor,Date.now());assert.equal(sorted[0].offer_id,b.offer_id);assert.deepEqual(filtered.map(o=>o.offer_id),[b.offer_id]);assert.equal(sourceRows[0].offer_id,a.offer_id);
  const h=mobileHarness(sourceRows);t.after(()=>h.dispose());await h.settle();assert.equal(h.value.ready,true);
  for(const text of ['choose offer 1','select listing 2','pick 1']){
    await h.value.send(text);await h.settle();assert.equal(h.value.sheet,'compare');assert.match(h.value.error,/Select button/);
    assert.equal(h.selectionCalls.length,0);assert.equal(h.flow.selectedOfferId,'');assert.equal(h.flow.selection,null);
  }
  assert.equal(h.apiRequests.some(r=>r.operation.startsWith('commerce/')),false);
});
