'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const localRequire=createRequire(path.resolve(__dirname,'../package.json')),ts=localRequire('typescript');
const stopped='The check was stopped. Refresh before continuing.';
const conversation=()=>({id:'current-chat',version:1,title:'Pikachu research',createdAt:1,updatedAt:2,expiresAt:Date.now()+60000,busy:false,messages:[{id:'before-stop',role:'assistant',status:'accepted',text:'Prior catalog answer',createdAt:1}],workspace:{version:1,result:{candidate_cards:[],preferences:{}}}});
const interrupted=()=>({...conversation(),version:2,messages:[...conversation().messages,{id:'interrupted',role:'assistant',status:'failed',text:'This check was interrupted. No result was accepted.',createdAt:2}]});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}

// Execute the real mobile, commerce and conversation hooks; only navigation and IO are substituted.
function harness(initial=conversation()){
  const cells=[],effects=[],requests=[],routes=[],reads=[],modules=new Map();
  let cursor=0,dirty=true,desired=initial.id,stored=structuredClone(initial),holdSend=false,value;
  const React={
    useState(initial){const i=cursor++;if(!cells[i])cells[i]={value:typeof initial==='function'?initial():initial};return[cells[i].value,next=>{cells[i].value=typeof next==='function'?next(cells[i].value):next;dirty=true;}];},
    useRef(initial){const i=cursor++;if(!cells[i])cells[i]={current:initial};return cells[i];},
    useEffect(fn,deps){const i=cursor++,old=cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){cells[i]={deps,cleanup:old?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn();});}},
    useCallback(fn,deps){const i=cursor++,old=cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j])))cells[i]={deps,value:fn};return cells[i].value;}
  };
  async function api(operation,payload,signal){
    requests.push({operation,payload,signal});
    if(signal?.aborted)throw Error('Request aborted');
    if(operation==='bootstrap')return{synthetic_demo:false};
    if(operation==='bookmark-list'||operation==='chat-list')return[];
    if(operation==='chat-get'){
      if(reads.length){const next=reads.shift();if(next instanceof Error)throw next;return await next;}
      return structuredClone(stored);
    }
    if(operation==='chat-cancel')return{cancellation_requested:true};
    if(operation==='chat-send'){
      if(holdSend){holdSend=false;return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('Request aborted')),{once:true});});}
      assert.equal(payload.version,stored.version,'a retry must use the adopted canonical version');
      stored={...stored,version:stored.version+1,messages:[...stored.messages,{id:'retry-answer',role:'assistant',status:'accepted',text:'Fresh catalog answer',createdAt:3}]};
      return structuredClone(stored);
    }
    throw Error('Unexpected request: '+operation);
  }
  function load(relative){
    const filename=path.resolve(__dirname,'../src/components/creator/pokemon',relative);
    if(modules.has(filename))return modules.get(filename);
    const moduleValue={exports:{}},compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    vm.runInNewContext(compiled,{exports:moduleValue.exports,module:moduleValue,require(id){
      if(id==='react')return React;
      if(id==='next/navigation')return{useRouter:()=>({replace:url=>routes.push(url)}),useSearchParams:()=>({get:()=>desired})};
      if(id==='../../pokemonClient')return{pokemonApi:api};
      if(id==='../live/useCommerceFlow')return load('live/useCommerceFlow.ts');
      if(id==='../live/useConversationCommerce')return load('live/useConversationCommerce.ts');
      if(id.startsWith('@/lib/'))return localRequire(path.resolve(__dirname,'../src/lib',id.slice('@/lib/'.length)));
      throw Error('Unexpected import: '+id);
    },AbortController,Date,Set,Map,Error,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout});
    modules.set(filename,moduleValue.exports);return moduleValue.exports;
  }
  const useMobileAgent=load('shopper/useMobileAgent.ts').default;
  function render(){cursor=0;dirty=false;value=useMobileAgent();while(effects.length)effects.shift()();return value;}
  async function settle(){for(let i=0;i<24;i++){if(dirty)render();await Promise.resolve();}if(dirty)render();return value;}
  return{requests,routes,reads,render,settle,get value(){return value;},get stored(){return structuredClone(stored);},setStored(next){stored=structuredClone(next);},holdNextSend(){holdSend=true;},navigate(id){desired=id;dirty=true;}};
}
async function stopPending(h,canonical){
  h.holdNextSend();const sending=h.value.send('Recommend Pikachu cards');await h.settle();
  assert.equal(h.value.pending,'agent');
  h.setStored(canonical);await h.value.stop();await sending;await h.settle();
}
function onlyExplicitTurn(h){assert.equal(h.requests.filter(r=>r.operation==='chat-send').length,1);assert.ok(h.requests.every(r=>!r.operation.startsWith('commerce/')));}

test('settled Refresh removes the Stop warning immediately and preserves interruption, explicit retry and reload',async()=>{
  const h=harness();await h.settle();await stopPending(h,{...conversation(),busy:true});
  assert.equal(h.value.ready,false);assert.equal(h.value.flow.error,stopped);
  h.setStored(interrupted());await h.value.refreshConversation();await h.settle();
  assert.equal(h.value.error,'');assert.equal(h.value.flow.error,'');assert.equal(h.value.ready,true);assert.equal(h.value.pending,'');
  assert.deepEqual(h.value.messages,interrupted().messages);onlyExplicitTurn(h);
  await h.value.send('Recommend English Pikachu cards');await h.settle();
  assert.equal(h.requests.filter(r=>r.operation==='chat-send').length,2);assert.equal(h.value.messages.at(-1).id,'retry-answer');
  const reloaded=harness(h.stored);await reloaded.settle();assert.equal(reloaded.value.ready,true);assert.equal(reloaded.value.error,'');
  assert.ok(reloaded.value.messages.some(m=>m.id==='interrupted'));assert.equal(reloaded.value.messages.at(-1).id,'retry-answer');
});
test('Stop clears its notice when its own canonical read has already settled',async()=>{
  const h=harness();await h.settle();await stopPending(h,interrupted());
  assert.equal(h.value.ready,true);assert.equal(h.value.error,'');assert.equal(h.value.flow.error,'');
  assert.deepEqual(h.value.messages,interrupted().messages);onlyExplicitTurn(h);
});
test('failed and still-busy Refresh remain blocked and keep honest errors until recovery succeeds',async()=>{
  const h=harness();await h.settle();await stopPending(h,{...conversation(),busy:true});
  h.reads.push(Error('Private session read failed'));await h.value.refreshConversation();await h.settle();
  assert.equal(h.value.ready,false);assert.equal(h.value.error,'Private session read failed');assert.equal(h.value.flow.error,stopped);
  await h.value.send('Do not send while unavailable');onlyExplicitTurn(h);
  await h.value.refreshConversation();await h.settle();assert.equal(h.value.ready,false);assert.match(h.value.error,/still settling/);assert.equal(h.value.flow.error,stopped);
  h.setStored(interrupted());await h.value.refreshConversation();await h.settle();assert.equal(h.value.ready,true);assert.equal(h.value.error,'');onlyExplicitTurn(h);
});
test('late old-conversation Refresh cannot clear a newer error or restore old history after New Chat',async()=>{
  const h=harness();await h.settle();await stopPending(h,{...conversation(),busy:true});
  const read=deferred();h.reads.push(read.promise);const refreshing=h.value.refreshConversation();await h.settle();
  h.value.newChat();h.navigate(null);await h.settle();h.value.flow.setError('A newer listing check needs attention');await h.settle();
  read.resolve(interrupted());await refreshing;await h.settle();assert.equal(h.value.thread,null);assert.equal(h.value.error,'A newer listing check needs attention');onlyExplicitTurn(h);
});
test('recovery does not erase an unrelated commerce error',async()=>{
  const h=harness();await h.settle();h.value.flow.setError('Selected listing expired');await h.settle();
  await h.value.refreshConversation();await h.settle();assert.equal(h.value.ready,true);assert.equal(h.value.error,'Selected listing expired');
  assert.equal(h.requests.filter(r=>r.operation==='chat-send').length,0);
});
test('a late older Refresh cannot re-block a conversation after the newer read settled',async()=>{
  const h=harness();await h.settle();await stopPending(h,{...conversation(),busy:true});
  const older=deferred();h.reads.push(older.promise);const first=h.value.refreshConversation();await h.settle();
  h.setStored(interrupted());await h.value.refreshConversation();await h.settle();
  older.resolve({...conversation(),busy:true});await first;await h.settle();
  assert.equal(h.value.ready,true);assert.equal(h.value.error,'');assert.equal(h.value.thread.version,2);onlyExplicitTurn(h);
});
test('an older Refresh cannot clear the newer pending read or its actual failure',async()=>{
  const h=harness();await h.settle();await stopPending(h,{...conversation(),busy:true});
  const older=deferred(),newer=deferred();h.reads.push(older.promise,newer.promise);
  const first=h.value.refreshConversation(),second=h.value.refreshConversation();await h.settle();
  older.resolve(interrupted());await first;await h.settle();assert.equal(h.value.pending,'history');assert.equal(h.value.ready,false);
  newer.reject(Error('Latest private read failed'));await second;await h.settle();
  assert.equal(h.value.pending,'');assert.equal(h.value.ready,false);assert.equal(h.value.error,'Latest private read failed');assert.equal(h.value.flow.error,stopped);onlyExplicitTurn(h);
});
test('an old Refresh cannot overwrite an explicit newer turn or clear its warning',async()=>{
  const h=harness();await h.settle();await stopPending(h,interrupted());
  const old=deferred();h.reads.push(old.promise);const reading=h.value.refreshConversation();await h.settle();
  await h.value.send('Recommend English Pikachu cards');await h.settle();h.value.flow.setError('A newer listing needs attention');await h.settle();
  old.resolve(interrupted());await reading;await h.settle();
  assert.equal(h.value.messages.at(-1).id,'retry-answer');assert.equal(h.value.thread.version,3);assert.equal(h.value.error,'A newer listing needs attention');
  assert.equal(h.requests.filter(r=>r.operation==='chat-send').length,2);
});
test('Refresh waits for Stop recovery to finish instead of racing its canonical read',async()=>{
  const h=harness();await h.settle();h.holdNextSend();const sending=h.value.send('Recommend Pikachu cards');await h.settle();
  const stopRead=deferred();h.reads.push(stopRead.promise);const stopping=h.value.stop();await h.settle();
  const readsBefore=h.requests.filter(r=>r.operation==='chat-get').length;
  h.setStored(interrupted());await h.value.refreshConversation();await h.settle();
  assert.equal(h.requests.filter(r=>r.operation==='chat-get').length,readsBefore);assert.equal(h.value.pending,'stopping');assert.equal(h.value.ready,false);
  stopRead.resolve({...conversation(),busy:true});await stopping;await sending;await h.settle();
  assert.equal(h.value.ready,false);assert.match(h.value.error,/still settling/);
  await h.value.refreshConversation();await h.settle();assert.equal(h.value.ready,true);assert.equal(h.value.error,'');assert.equal(h.value.thread.version,2);onlyExplicitTurn(h);
});
