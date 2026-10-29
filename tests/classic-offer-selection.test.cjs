'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),ts=require('typescript'),{randomUUID}=require('node:crypto');
const sample=require('./commerceSamples.cjs'),{exactListing}=require('./listingEvidenceSamples.cjs'),{readiness}=require('./sourceReadinessSamples.cjs');
const history=require('../src/lib/pokemon/commerceHistory.cjs'),{commerceIntent}=require('../src/lib/pokemon/commerceChat.cjs');
const componentRoot=path.resolve(__dirname,'../src/components/creator/pokemon');
function walk(node,predicate,found=[]){
  if(Array.isArray(node)){for(const child of node)walk(child,predicate,found);}
  else if(React.isValidElement(node)){if(predicate(node))found.push(node);walk(node.props.children,predicate,found);}
  return found;
}

// Execute the actual components, hooks and conversation transport. Only React
// scheduling, the DOM scroll target and IO are replaced; the API below invokes
// the real server-side history begin/finish validators without any sockets.
function runtime(dependencies={}){
  const cells=[],effects=[],modules=new Map();let cursor=0,dirty=true,entry,tree,scrolls=0;
  const hooks={...React,
    useState(initial){const i=cursor++;if(!(i in cells))cells[i]={value:typeof initial==='function'?initial():initial};return[cells[i].value,next=>{cells[i].value=typeof next==='function'?next(cells[i].value):next;dirty=true;}];},
    useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
    useEffect(fn,deps){const i=cursor++,old=cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){cells[i]={deps,cleanup:old?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn();});}},
    useCallback(fn,deps){const i=cursor++,old=cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))cells[i]={deps,value:fn};return cells[i].value;}
  };
  function load(relative){
    const file=path.resolve(componentRoot,relative);if(modules.has(file))return modules.get(file).exports;
    const m={exports:{}};modules.set(file,m);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(code,{module:m,exports:m.exports,Date,Intl,Set,Map,Error,AbortController,crypto:require('node:crypto').webcrypto,setTimeout:()=>0,clearTimeout(){},require(id){
      if(id==='react')return hooks;
      if(id in dependencies)return dependencies[id];
      if(id.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
      if(id.startsWith('@/lib/'))return require(path.resolve(__dirname,'../src/lib',id.slice(6)));
      if(id.startsWith('.')){const base=path.resolve(path.dirname(file),id);return load(path.relative(componentRoot,base+(fs.existsSync(base+'.tsx')?'.tsx':'.ts')));}
      return require(id);
    }});return m.exports;
  }
  function render(){cursor=0;dirty=false;tree=entry();for(const node of walk(tree,n=>typeof n.type==='string'&&n.ref&&typeof n.ref==='object'))node.ref.current={scrollIntoView(){scrolls++;}};while(effects.length)effects.shift()();return tree;}
  return{load,start(fn){entry=fn;render();},render,get tree(){return tree;},get scrolls(){return scrolls;},async settle(){for(let i=0;i<40;i++){if(dirty)render();await Promise.resolve();}if(dirty)render();},dispose(){for(const c of cells)c?.cleanup?.();}};
}

function classicHarness({inactive=false}={}){
  const before=new Date(Date.now()-1000).toISOString(),expires=new Date(Date.now()+300000).toISOString(),requests=[];
  function listing(id,price,grade='10',source='mercari'){
    const snkr=source==='snkrdunk';return exactListing({...sample.offer(),offer_id:id,native_id:id,source,url:snkr?'https://snkrdunk.com/apparels/12345/used/'+id:'https://jp.mercari.com/item/'+id,price_minor:price,grade:{company:'PSA',value:grade,certificate_verified:false},observed_at:before,fresh_until:expires,seller:{id:'seller-'+id,display_name:null,url:null,evidence_ref:'fixture:exact-listing-seller',observed_at:before,reputation:null}});
  }
  const offers=[listing('m11111111111',2500),listing('m22222222222',2000),listing('67890',1500,'10','snkrdunk'),listing('m33333333333',1000,'9')];
  const research={...sample.research(),checked_at:before,offers,source_readiness:readiness({enabled:!inactive}).map(r=>inactive?r:{...r,status:'enabled',method:r.source==='ebay_us'?'api':'crawl',listing_read_enabled:true,blocker:null})};
  let document={id:randomUUID(),version:0,title:'Synthetic classic choice',messages:[]},flow,command=null,selected;
  async function api(operation,payload){
    requests.push({operation,payload:structuredClone(payload)});
    if(operation==='chat-get')return structuredClone(document);
    const {conversation,...request}=payload,op=operation.replace('commerce/','');
    history.context(conversation);assert.equal(conversation.id,document.id);
    document=history.begin(document,{...conversation,operation:op,request});
    let response;
    if(op==='research')response=structuredClone(research);
    else if(op==='select'){selected=offers.find(o=>o.offer_id===request.offer_id);response={...sample.selection(),expires_at:expires,offer:structuredClone(selected)};}
    else if(op==='handoff')response={...sample.handoff(),product_url:selected.url};
    else throw Error('Unexpected API '+operation);
    document=history.finish(document,{event_id:document.commercePending.id,operation:op,request,response});return response;
  }
  function Comparison(){return null;}
  const r=runtime({'../../pokemonClient':{pokemonApi:api},'../shopper/OfferEvidenceBoard':{__esModule:true,default:Comparison},'./BnsReview':{__esModule:true,default:()=>null},'./PsaCertificate':{__esModule:true,default:()=>null}});
  const useFlow=r.load('live/useCommerceFlow.ts').default;
  // Capture the real hook output while the panel invokes it normally.
  r.load('live/useCommerceFlow.ts').default=config=>(flow=useFlow(config));
  const Panel=r.load('live/CommercePanel.tsx').default,useTransport=r.load('live/useConversationCommerce.ts').default;
  r.start(()=>{const transport=useTransport(document,updated=>{document=updated;},()=>assert.fail('conversation became unavailable'));return Panel({cardId:research.card_id,cardName:'Synthetic Pikachu',chatCommand:command,transport});});
  return{...r,get tree(){return r.tree;},get scrolls(){return r.scrolls;},get flow(){return flow;},get document(){return document;},requests,offers,research,
    get boardProps(){return walk(r.tree,n=>n.type===Comparison)[0].props;},
    async researchOffers(){await flow.researchOffers({card_id:research.card_id,query:'Pikachu PSA 10',platforms:['mercari','snkrdunk']});await r.settle();flow.setGrade('10');await r.settle();},
    async send(text){command={id:randomUUID(),...commerceIntent(text)};r.render();await r.settle();}
  };
}

function boardHarness(props){const r=runtime(),Board=r.load('shopper/OfferEvidenceBoard.tsx').default;r.start(()=>Board(props));return{...r,get tree(){return r.tree;},setFilter(label,value){walk(r.tree,n=>n.type==='select'&&n.props['aria-label']===label)[0].props.onChange({target:{value}});r.render();},articles(){return walk(r.tree,n=>n.type==='article');}};}

test('classic numeric choices reveal the actual sorted or filtered board without selecting a source-order listing',async t=>{
  for(const [filter,value] of [['Offer sort order','price'],['Marketplace filter','snkrdunk']]){
    const h=classicHarness();t.after(()=>h.dispose());await h.researchOffers();
    assert.equal(h.flow.rows.length,3,'PSA 9 remains outside the selected grade group');
    const b=boardHarness(h.boardProps);t.after(()=>b.dispose());assert.match(b.articles()[0].props['aria-label'],/m11111111111/);b.setFilter(filter,value);
    const visible=b.articles(),first=visible[0];assert.match(first.props['aria-label'],/67890/);assert.equal(h.flow.rows[0].native_id,'m11111111111');
    const before=h.requests.length,version=h.document.version;
    for(const text of ['choose offer 1','select listing 2','pick 1','choose option 99']){
      await h.send(text);assert.equal(h.requests.length,before);assert.equal(h.document.version,version);assert.equal(h.document.messages.at(-1).commerce.status,'researched');assert.equal(h.flow.selectedOfferId,'');assert.equal(h.flow.selection,null);assert.equal(h.flow.receipt,null);
      assert.match(renderToStaticMarkup(h.tree),/exact seller listing.*Select listing or Select for review/);
    }
    assert.equal(h.scrolls,4,'each numeric command brings the comparison into view');
    const button=walk(first,n=>n.type==='button'&&n.props.children==='Select listing')[0];
    assert.equal(button.props.disabled,false);assert.match(button.props['aria-label'],/SNKRDUNK listing 67890, Seller seller-67890/);
    button.props.onClick();await h.settle();
    const selected=h.requests.find(r=>r.operation==='commerce/select');assert.equal(selected.payload.offer_id,'67890');assert.equal(selected.payload.expected_price_minor,1500);assert.equal(h.flow.selection.offer.seller.id,'seller-67890');assert.equal(h.document.messages.at(-1).commerce.status,'selected');
    assert.equal(h.requests.some(r=>/handoff|order|payment/.test(r.operation)),false);
    const selectedVersion=h.document.version;await h.send('choose offer 1');assert.equal(h.document.version,selectedVersion);assert.equal(h.flow.selection.offer.offer_id,'67890','a numeric reference cannot silently switch an existing exact selection');
  }
});

test('classic numeric choices retain source-off action guards and create no selection or BNS request',async t=>{
  const h=classicHarness({inactive:true});t.after(()=>h.dispose());await h.researchOffers();const count=h.requests.length;
  await h.send('choose offer 1');assert.equal(h.requests.length,count);
  const b=boardHarness(h.boardProps);t.after(()=>b.dispose());const actions=walk(b.tree,n=>n.type==='button'&&n.props.className==='choose');assert.equal(actions.length,3);assert.ok(actions.every(n=>n.props.disabled));
  await h.flow.selectOffer(h.offers[0].offer_id);await h.settle();assert.equal(h.requests.length,count);assert.equal(h.flow.selection,null);assert.match(h.flow.error,/source is not active/);
});

test('classic quote commands keep destination confirmation and provider variant selection explicit',async t=>{
  const h=classicHarness();t.after(()=>h.dispose());await h.researchOffers();h.boardProps.onSelect(h.offers[1].offer_id);await h.settle();
  const before=h.requests.length;await h.send('quote to United States state CA');assert.equal(h.requests.length,before);assert.equal(h.flow.country,'US');assert.equal(h.flow.region,'CA');assert.equal(h.flow.selection,null);
  await h.send('quote to United States state CA');assert.equal(h.flow.receipt.status,'variant_selection_required');assert.deepEqual(h.requests.find(r=>r.operation==='commerce/handoff').payload.destination,{country:'US',state:'CA'});
  const variantRequests=h.requests.length;await h.send('quote to United States state CA');assert.equal(h.requests.length,variantRequests,'a quote cannot advance before an explicit in-stock option choice');
  await h.send('choose variant 2');assert.equal(h.flow.variantKey,'');assert.equal(h.requests.length,variantRequests);
  await h.send('choose variant 1');assert.equal(h.flow.variantKey,'sku-1');assert.equal(h.requests.length,variantRequests,'choosing an option does not submit a quote');
  await h.send('quote to Hong Kong');assert.equal(h.flow.country,'HK');assert.equal(h.flow.region,'');assert.equal(h.flow.variantKey,'');assert.equal(h.flow.receipt,null);assert.equal(h.requests.length,variantRequests,'a destination change requires another explicit continuation');
});

test('classic chat copy directs exact seller selection and preserves explicit variant and destination commands',()=>{
  // Use React SSR to inspect the copy without running command effects.
  const file=path.join(componentRoot,'live/CommerceChat.tsx'),m={exports:{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require(id){if(id==='react')return React;if(id.startsWith('@/lib/'))return require(path.resolve(__dirname,'../src/lib',id.slice(6)));if(id==='../../pokemonClient')return{pokemonApi(){assert.fail('SSR must be passive');}};if(id.endsWith('.module.css'))return{__esModule:true,default:{}};if(id==='./useConversationRecovery')return{__esModule:true,default:()=>({blocked:false})};if(id.startsWith('.'))return{__esModule:true,default:()=>null};return require(id);}});
  const html=renderToStaticMarkup(React.createElement(m.exports.default,{command:{id:'copy',kind:'select',text:'choose offer 1',index:0},onBusyChange(){},transport(){assert.fail('SSR must be passive');}}));
  assert.match(html,/Use Select listing or Select for review on the exact seller listing/);assert.match(html,/Offer numbers in chat open the comparison/);assert.doesNotMatch(html,/ask “choose offer 1”|choose an offer number/);
  assert.deepEqual(commerceIntent('choose variant 2'),{kind:'variant',index:1});assert.deepEqual(commerceIntent('quote to United States state CA'),{kind:'handoff',country:'US',state:'CA'});
});
