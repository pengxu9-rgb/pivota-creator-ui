'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),localRequire=createRequire(path.resolve(__dirname,'../package.json'));
const ts=localRequire('typescript'),React=localRequire('react'),{renderToStaticMarkup}=localRequire('react-dom/server');
const card={card_id:'ja:SV2A:173/165:holo',name:'Pikachu',language:'ja',set_code:'SV2A',set_name:'Pokémon Card151',collector_number:'173/165',rarity:'AR'};

// Execute the actual component's click handlers, hooks and dialog effect. The
// dialog methods model the browser API; rendered browser acceptance is separate.
function harness(overrides={},browsingBeta=true){
  const accepted={id:'answer',role:'assistant',status:'accepted',text:'Here are the recorded catalog cards.',cards:[card]},
    requests=[],sheets=[],cells=[],effects=[],closeEvents=[];
  let cursor=0,tree,currentDialogProps,renderCount=0;
  const state={ready:true,restoringConversation:false,pending:'',error:'',messages:[accepted],cards:[card],history:[],bookmarks:[],compareIds:[],feedback:{},latestCatalogMessage:accepted,
    thread:{id:'current-chat',workspace:{result:{candidate_cards:[card],preferences:{},recommendation:{}}}},draft:null,card:null,sheet:null,budget:null,budgetCurrency:null,gradePreference:'',
    flow:{research:null,selection:null,receipt:null,country:'HK',region:'',bindingKey:'',clock:Date.now()},...overrides};
  for(const name of ['send','researchCard','prepareHandoff','openCertificate','saveCard','historicalResearch','catalogAction'])state[name]=()=>{requests.push(name);throw Error('Unexpected data operation '+name);};
  state.setSheet=value=>{state.sheet=typeof value==='function'?value(state.sheet):value;sheets.push(state.sheet);};
  const dialog={open:false,showModalCalls:0,closeCalls:0,showModal(){this.showModalCalls++;this.open=true;},close(){this.closeCalls++;if(this.open){this.open=false;closeEvents.push(()=>currentDialogProps.onClose());}}};
  const hookReact={...React,useState(initial){const i=cursor++;if(!cells[i])cells[i]={value:typeof initial==='function'?initial():initial};return[cells[i].value,next=>{cells[i].value=typeof next==='function'?next(cells[i].value):next;}];},useRef(initial){const i=cursor++;if(!cells[i])cells[i]={current:initial};return cells[i];},useEffect(fn,deps){const i=cursor++,old=cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){cells[i]={deps};effects.push(fn);}}};
  const root=path.resolve(__dirname,'../src/components/creator'),cache=new Map();
  function load(relative){
    const filename=path.resolve(root,relative);if(cache.has(filename))return cache.get(filename);
    const moduleValue={exports:{}},compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(compiled,{exports:moduleValue.exports,module:moduleValue,Date,Intl,Set,Map,require(id){
      if(id==='react')return hookReact;
      if(id==='lucide-react')return new Proxy({},{get:()=>()=>null});
      if(id==='next/link')return{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};
      if(id==='./useMobileAgent')return{__esModule:true,default:()=>state};
      if(id==='../live/LiveCollector')return{CurrentCards:({children})=>children,CatalogArtwork:()=>null};
      if(id==='../live/PsaCertificate'||id==='../live/BnsReview')return{__esModule:true,default:()=>null};
      if(id.endsWith('.module.css'))return{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
      if(id.startsWith('@/lib/'))return localRequire(path.resolve(__dirname,'../src/lib',id.slice('@/lib/'.length)));
      if(id.startsWith('.'))return load(path.relative(root,path.resolve(path.dirname(filename),id+'.tsx')));
      return localRequire(id);
    }});cache.set(filename,moduleValue.exports);return moduleValue.exports;
  }
  const Component=load('pokemon/shopper/MobileAgent.tsx').default;
  function nodes(node,result=[]){if(Array.isArray(node)){for(const child of node)nodes(child,result);}else if(node&&typeof node==='object'&&node.props){result.push(node);nodes(node.props.children,result);}return result;}
  function text(node){if(typeof node==='string'||typeof node==='number')return String(node);if(Array.isArray(node))return node.map(text).join('');return node?.props?text(node.props.children):'';}
  function render(){
    cursor=0;renderCount++;tree=Component({browsingBeta});
    for(const node of nodes(tree)){
      const ref=Object.getOwnPropertyDescriptor(node.props,'ref')?.value??Object.getOwnPropertyDescriptor(node,'ref')?.value;
      if(ref&&typeof ref==='object'){
        if(node.type==='dialog'){ref.current=dialog;currentDialogProps=node.props;}
        else ref.current={focus(){},scrollIntoView(){}};
      }
    }
    while(effects.length)effects.shift()();return tree;
  }
  function buttons(label){return nodes(tree).filter(n=>n.type==='button'&&(n.props['aria-label']===label||text(n.props.children)===label));}
  function click(button){assert.ok(button,'button exists');assert.equal(!!button.props.disabled,false,'button enabled');button.props.onClick({target:button});render();}
  render();
  return{state,requests,sheets,dialog,render,buttons,click,get html(){return renderToStaticMarkup(tree);},get renderCount(){return renderCount;},flushClose(){while(closeEvents.length)closeEvents.shift()();render();}};
}

test('beta card and footer describe the off state before an explanation is opened',()=>{
  const h=harness();assert.equal(h.buttons('Why seller offers are off').length,2);
  assert.equal(h.buttons('Why seller offers are off')[0].props.className,'secondary sellerAccess');
  assert.match(h.html,/Seller offers and BNS quotes off · .*Orders and payments disabled/);
  assert.doesNotMatch(h.html,/Find seller listings|Check BNS quote|Prepare URL handoff|aria-label="Buying path"/);
  assert.deepEqual(h.requests,[]);
});

for(const entry of ['card','footer'])test(`actual ${entry} explanation click opens and dismisses the local dialog without losing results or requesting offers`,()=>{
  const h=harness(),original=h.state.messages;
  h.click(h.buttons('Why seller offers are off')[entry==='card'?0:1]);
  assert.equal(h.state.sheet,'offers');assert.equal(h.dialog.open,true);assert.equal(h.dialog.showModalCalls,1);
  assert.match(h.html,/<h2>Seller offers are off<\/h2>/);
  assert.match(h.html,/Seller offers are not enabled in this beta/);
  assert.match(h.html,/Seller price and availability checks are switched off here/);
  assert.match(h.html,/BNS quote requests are off in this beta/);
  assert.doesNotMatch(h.html,/Choose a seller listing before requesting|Check BNS quote|Prepare URL handoff|Open Buy/);
  assert.equal(h.state.messages,original);assert.match(h.html,/Here are the recorded catalog cards/);assert.match(h.html,/Pikachu/);
  h.click(h.buttons('Close panel')[0]);h.flushClose();
  assert.equal(h.state.sheet,null);assert.equal(h.dialog.open,false);assert.equal(h.state.messages,original);
  assert.deepEqual(h.requests,[]);assert.ok(h.sheets.every(value=>value===null||value==='offers'));
});

test('loading, restore, first-turn work and recovery error never render a false welcome screen',()=>{
  const empty={messages:[],cards:[],thread:null,latestCatalogMessage:null};
  const restore=harness({...empty,ready:false,restoringConversation:true});
  assert.match(restore.html,/Opening your conversation/);assert.doesNotMatch(restore.html,/What would you|Recommend Japanese Pikachu cards/);
  const initial=harness({...empty,ready:false});assert.match(initial.html,/Connecting to Pot/);assert.doesNotMatch(initial.html,/What would you/);
  const pending=harness({...empty,pending:'agent'});assert.match(pending.html,/Your catalog agent is thinking/);assert.doesNotMatch(pending.html,/What would you/);
  const error=harness({...empty,ready:false,restoringConversation:true,error:'This session is unavailable.'});assert.match(error.html,/This session is unavailable/);assert.doesNotMatch(error.html,/Opening your conversation|What would you/);
  const waiting=harness({...empty,thread:{busy:true}});assert.match(waiting.html,/An earlier check is still pending/);assert.doesNotMatch(waiting.html,/What would you/);
  const fresh=harness(empty);assert.match(fresh.html,/What would you/);
});

test('existing catalog results stay rendered during recovery and no active request is implied by an off-state panel',()=>{
  const h=harness({ready:false,restoringConversation:true});assert.match(h.html,/Here are the recorded catalog cards/);assert.match(h.html,/Pikachu/);assert.doesNotMatch(h.html,/Opening your conversation|What would you/);
  h.state.ready=true;h.state.restoringConversation=false;h.render();h.click(h.buttons('Why seller offers are off')[0]);
  assert.match(h.html,/Seller offers are not enabled in this beta/);assert.deepEqual(h.requests,[]);
});

test('non-beta listing actions retain the existing live-flow contract and copy',()=>{
  const h=harness({},false);assert.equal(h.buttons('Why seller offers are off').length,0);assert.equal(h.buttons('Find seller listings').length,1);
  assert.match(h.html,/Orders and payments disabled/);assert.doesNotMatch(h.html,/Seller offers and BNS quotes off/);
});
