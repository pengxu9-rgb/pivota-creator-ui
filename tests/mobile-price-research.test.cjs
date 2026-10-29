'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),localRequire=createRequire(path.resolve(__dirname,'../package.json'));
const ts=localRequire('typescript'),React=localRequire('react'),{renderToStaticMarkup}=localRequire('react-dom/server');
const sample=require('./commerceSamples.cjs'),clock=Date.parse('2026-10-22T01:00:02Z');
function listing(){const offer=sample.offer();offer.seller={id:'fixture-seller-1',display_name:null,url:null,evidence_ref:'offline-fixture:seller',observed_at:offer.observed_at,reputation:null};return offer;}
function render({synthetic=false,forwarders=[],selected=true,expired=false,sheet='compare',browsingBeta=false}={}){
  const offer={...listing(),synthetic},research={...sample.research(),mode:synthetic?'synthetic_fixture':'on_demand_research',offers:[offer],forwarders};
  const state={ready:true,pending:'',error:'',thread:{workspace:{result:{candidate_cards:[],preferences:{}}}},messages:[],cards:[],history:[],bookmarks:[],compareIds:[],feedback:{},sheet,budget:null,budgetCurrency:null,gradePreference:'',
    card:{card_id:research.card_id,name:'Pikachu',collector_number:'173/165',set_code:'SV2A',language:'ja'},
    flow:{research,receipt:null,country:'HK',region:'',bindingKey:'',rows:[offer],clock,grade:'10',currency:'JPY',forwarder:forwarders.find(p=>p.quote_available||p.manual_handoff_available)?.id||'',certificateResults:{},selection:selected?sample.selection():null,selectionExpired:expired,chosen:selected?offer:null}};
  function load(relative){const file=path.resolve(__dirname,'../src/components/creator',relative),moduleValue={exports:{}};
    const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(compiled,{exports:moduleValue.exports,module:moduleValue,Date,Intl,require(id){
      if(id==='./useMobileAgent')return {__esModule:true,default:()=>state};
      if(id==='next/link')return {__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
      if(id==='../live/LiveCollector')return {CurrentCards:({children})=>children,CatalogArtwork:()=>React.createElement('div',{},'Catalog artwork component')};
      if(id==='../live/PsaCertificate'||id==='../live/BnsReview')return {__esModule:true,default:()=>null};
      if(id.endsWith('.module.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
      if(id.startsWith('@/lib/'))return localRequire(path.resolve(__dirname,'../src/lib',id.slice('@/lib/'.length)));
      if(id.startsWith('.'))return load(path.relative(path.resolve(__dirname,'../src/components/creator'),path.resolve(path.dirname(file),id+'.tsx')));
      return localRequire(id);
    }});return moduleValue.exports;
  }
  return renderToStaticMarkup(React.createElement(load('pokemon/shopper/MobileAgent.tsx').default,{browsingBeta}));
}
test('no usable forwarder renders price research only with canonical selection review and a validated seller ID',()=>{
  for(const forwarders of [[],[{id:'buyship',label:'Buy & Ship',quote_available:false,manual_handoff_available:false}]]){
    const html=render({forwarders});assert.match(html,/Price research only/);assert.match(html,/Selected for price review/);assert.match(html,/Seller fixture-seller-1/);assert.doesNotMatch(html,/Seller unreported/);
    assert.match(html,/<input[^>]*aria-label="Selected canonical URL"[^>]*readonly=""[^>]*value="https:\/\/jp.mercari.com\/item\/m12345678901"/);
    assert.doesNotMatch(html,/aria-label="Buying path"|Listing-check destination|Prepare URL handoff|Check delivered quote|informational URL handoff|Look up a PSA certificate record|Check certificate record/);
  }
});
test('synthetic research suppresses provider controls even if a producer reports a forwarder',()=>{
  const html=render({synthetic:true,forwarders:[{id:'buyship',label:'Buy & Ship',quote_available:true,manual_handoff_available:true}]});
  assert.match(html,/These are synthetic listing examples/);assert.match(html,/No artwork/);assert.match(html,/Synthetic fixture/);
  assert.doesNotMatch(html,/aria-label="Buying path"|Listing-check destination|Prepare URL handoff|Check delivered quote|Look up a PSA certificate record|Check certificate record|href="https:\/\/jp.mercari.com\/item/);
});
test('ordinary live quote and manual forwarders retain their existing controls',()=>{
  for(const quote of [true,false]){
    const html=render({forwarders:[{id:'buyship',label:'Buy & Ship',quote_available:quote,manual_handoff_available:true}]});
    assert.match(html,/aria-label="Buying path"/);assert.match(html,/Listing-check destination/);assert.match(html,/Look up a PSA certificate record/);
    assert.match(html,quote?/Check delivered quote/:/Prepare URL handoff/);assert.doesNotMatch(html,/Price research only|Selected canonical URL/);
  }
});
test('price-only empty and expired choices cannot be presented as current selected reviews',()=>{
  const empty=render({selected:false});assert.match(empty,/No selection/);assert.doesNotMatch(empty,/Selected canonical URL|Selected for price review|Prepare URL handoff/);
  const expired=render({expired:true});assert.match(expired,/Selection expired · refresh listings/);assert.doesNotMatch(expired,/Selected for price review|Prepare URL handoff/);
});
test('typed provider commands in price-only mode open an explanatory fallback instead of an empty sheet',()=>{
  const psa=render({synthetic:true,sheet:'psa'});assert.match(psa,/PSA lookup unavailable/);assert.match(psa,/Seller grade claims have not been verified with PSA/);assert.match(psa,/Back to listing review/);
  const handoff=render({synthetic:true,sheet:'handoff'});assert.match(handoff,/Buying service unavailable/);assert.match(handoff,/Delivered quotes and URL handoff are unavailable/);assert.match(handoff,/Back to listing review/);
});

test('browsing beta exposes a passive seller-access journey without source or quote controls',()=>{const html=render({browsingBeta:true,sheet:'offers'});assert.match(html,/Seller offer access/);assert.match(html,/Seller offers are not enabled in this beta/);assert.match(html,/BNS quote requests are off/);assert.doesNotMatch(html,/Check delivered quote|Prepare URL handoff|aria-label="Buying path"|Open Buy&amp;Ship request entry/);});
