'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const localRequire=createRequire(path.resolve(__dirname,'../package.json'));
const ts=localRequire('typescript');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const clone=value=>structuredClone(value);

// Actual hook + deterministic scheduling and transport. The native-history
// double mirrors Next15's ACTION_RESTORE echo without a server navigation.
function harness(initialId=null,{browsingBeta=true}={}){
  const cells=[],effects=[],requests=[],routerNavigations=[],historyWrites=[],states=[],stored=new Map(),selections=[];
  let cursor=0,dirty=true,desired=initialId,value,nextId=0,historyEcho=null,sendHold=null,readHold=null;
  const conversation=(id,messages=[])=>({id,version:0,title:'URL stability test',createdAt:1,updatedAt:1,expiresAt:60001,busy:false,messages,
    workspace:{version:0,result:{candidate_cards:[],preferences:{}}}});
  const assistant=(id,text)=>({id,role:'assistant',status:'accepted',text,createdAt:1});
  stored.set('A',conversation('A',[assistant('A-0','Conversation A')]));
  stored.set('B',conversation('B',[assistant('B-0','Conversation B')]));
  const React={
    useState(initial){const i=cursor++;if(!cells[i])cells[i]={value:typeof initial==='function'?initial():initial};return[cells[i].value,next=>{cells[i].value=typeof next==='function'?next(cells[i].value):next;dirty=true;}];},
    useRef(initial){const i=cursor++;if(!cells[i])cells[i]={current:initial};return cells[i];},
    useEffect(fn,deps){const i=cursor++,old=cells[i];if(!old||deps.some((v,j)=>!Object.is(v,old.deps[j]))){cells[i]={deps,cleanup:old?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn();});}},
  };
  const api=async(operation,payload,signal)=>{
    if(signal?.aborted)throw Error('request aborted before dispatch');
    const request={operation,payload:clone(payload),signal};requests.push(request);
    if(operation==='bootstrap')return{synthetic_demo:false};
    if(operation==='bookmark-list'||operation==='chat-list')return[];
    if(operation==='chat-create'){
      const c=conversation('new-'+(++nextId));stored.set(c.id,c);return clone(c);
    }
    if(operation==='chat-get'){
      if(readHold){const hold=readHold;readHold=null;await hold.promise;}
      if(signal?.aborted)throw Error('read aborted');
      return clone(stored.get(payload.id));
    }
    if(operation==='chat-send'){
      if(sendHold){const hold=sendHold;sendHold=null;await hold.promise;}
      if(signal?.aborted)throw Error('send aborted');
      const previous=stored.get(payload.id);assert.equal(previous.version,payload.version);
      const current={...previous,version:previous.version+1,updatedAt:previous.updatedAt+1,
        messages:[...previous.messages,{id:'user-'+previous.version,role:'user',status:'submitted',text:payload.text,createdAt:1},assistant('reply-'+previous.version,'Recorded result for '+payload.text)]};
      stored.set(current.id,current);return clone(current);
    }
    throw Error('unexpected operation '+operation);
  };
  const flow={running:{current:false},grade:'',country:'HK',region:'',research:null,bindingKey:'',error:'',pending:'',
    rows:[{offer_id:'source-order-first'},{offer_id:'visible-order-first'}],selectOffer:async id=>selections.push(id),
    reset(){},setError(v){this.error=v;},setGrade(v){this.grade=v;},setCountry(v){this.country=v;},setRegion(v){this.region=v;}};
  const browser={history:{replaceState(data,title,url){
    assert.equal(data,null);assert.equal(title,'');
    const target=new URL(url,'https://pot.example');
    assert.equal(target.pathname,'/creator/pokemon-collector/shopper');
    historyWrites.push(url);historyEcho=target.searchParams.get('conversation');
  }}};
  const filename=process.env.POT_CHAT_TEST_HOOK_SOURCE||path.resolve(__dirname,'../src/components/creator/pokemon/shopper/useMobileAgent.ts');
  const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const moduleValue={exports:{}};
  vm.runInNewContext(compiled,{exports:moduleValue.exports,module:moduleValue,window:browser,require(id){
    if(id==='react')return React;
    if(id==='next/navigation')return{useRouter:()=>({replace:url=>routerNavigations.push(url)}),useSearchParams:()=>({get:()=>desired})};
    if(id==='../../pokemonClient')return{pokemonApi:api};
    if(id==='../live/useCommerceFlow')return{__esModule:true,default:()=>flow};
    if(id==='../live/useConversationCommerce')return{__esModule:true,default:()=>()=>{throw Error('commerce must not run');}};
    if(id.startsWith('@/lib/'))return localRequire(path.resolve(__dirname,'../src/lib',id.slice('@/lib/'.length)));
    throw Error('unexpected import '+id);
  },AbortController,Date,Set,Map,Error});
  function render(){cursor=0;dirty=false;value=moduleValue.exports.default({browsingBeta});states.push({threadId:value.thread?.id||null,messages:clone(value.messages),ready:value.ready,restoring:value.restoringConversation});while(effects.length)effects.shift()();return value;}
  async function settle(){for(let i=0;i<20;i++){if(dirty)render();await Promise.resolve();}if(dirty)render();return value;}
  return{requests,routerNavigations,historyWrites,states,selections,render,settle,get value(){return value;},
    echoHistory(){assert.notEqual(historyEcho,null,'there must be a self-authored URL change');desired=historyEcho;historyEcho=null;dirty=true;},
    navigate(id){desired=id;dirty=true;},holdNextSend(){sendHold=deferred();return sendHold;},holdNextRead(){readHold=deferred();return readHold;},
    dispose(){for(const cell of cells)cell?.cleanup?.();},
  };
}

test('first reply updates only its client address; no router request, reset or duplicate bootstrap',async()=>{
  const h=harness();await h.settle();
  await h.value.send('pikacu card');await h.settle();
  assert.equal(h.value.thread.id,'new-1');assert.equal(h.value.messages.at(-1).text,'Recorded result for pikacu card');
  assert.deepEqual(h.routerNavigations,[]);assert.deepEqual(h.historyWrites,['/creator/pokemon-collector/shopper?conversation=new-1']);
  const firstResult=h.states.findIndex(s=>s.messages.length>0);assert.ok(firstResult>=0);
  h.echoHistory();await h.settle();
  assert.ok(h.states.slice(firstResult).every(s=>s.threadId==='new-1'&&s.messages.length===2&&s.ready),'self URL echo must never render welcome/empty state');
  assert.equal(h.requests.filter(r=>r.operation==='bootstrap').length,1);assert.equal(h.requests.filter(r=>r.operation==='chat-get').length,0);
  assert.equal(h.requests.filter(r=>r.operation==='chat-create').length,1);assert.equal(h.requests.filter(r=>r.operation==='chat-send').length,1);
  h.dispose();
});

test('deferred self URL echo does not abort a follow-up that started after the first result',async()=>{
  const h=harness();await h.settle();await h.value.send('pikacu card');await h.settle();
  const hold=h.holdNextSend(),followup=h.value.send('show another printing');await h.settle();
  const request=h.requests.filter(r=>r.operation==='chat-send').at(-1);assert.equal(request.payload.version,1);
  h.echoHistory();await h.settle();
  assert.equal(request.signal.aborted,false,'bootstrap cleanup must not cancel newer business work');
  assert.equal(h.value.thread.id,'new-1');assert.equal(h.value.messages.length,2);assert.equal(h.value.pending,'agent');
  hold.resolve();await followup;await h.settle();
  assert.equal(h.value.messages.length,4);assert.equal(h.value.error,'');assert.equal(h.value.pending,'');
  assert.equal(h.requests.filter(r=>r.operation==='bootstrap').length,1);assert.deepEqual(h.routerNavigations,[]);
  h.dispose();
});

test('true browser back/forward target changes abort old work and never restore it into the other thread',async()=>{
  const h=harness('A');await h.settle();
  const hold=h.holdNextSend(),oldTurn=h.value.send('late A reply');await h.settle();
  const request=h.requests.filter(r=>r.operation==='chat-send').at(-1);
  const restoring=h.holdNextRead();h.navigate('B');await h.settle();assert.equal(h.value.restoringConversation,true);assert.equal(h.value.thread,null);
  assert.equal(request.signal.aborted,true);restoring.resolve();await h.settle();assert.equal(h.value.thread.id,'B');
  hold.resolve();await oldTurn;await h.settle();
  assert.equal(h.value.thread.id,'B');assert.equal(h.value.messages[0].text,'Conversation B');assert.equal(h.value.error,'');
  h.navigate('A');await h.settle();assert.equal(h.value.thread.id,'A');assert.equal(h.value.messages.length,1);assert.equal(h.value.messages[0].text,'Conversation A');
  assert.deepEqual(h.historyWrites,[]);assert.deepEqual(h.routerNavigations,[]);
  h.dispose();
});

test('opening a saved conversation reports restore state until its read settles',async()=>{
  const h=harness('A'),hold=h.holdNextRead();await h.settle();
  assert.equal(h.value.ready,false);assert.equal(h.value.thread,null);assert.equal(h.value.restoringConversation,true);
  hold.resolve();await h.settle();assert.equal(h.value.ready,true);assert.equal(h.value.thread.id,'A');assert.equal(h.value.restoringConversation,false);
  h.dispose();
});

test('explicit new chat keeps navigation readiness/cancellation and creates no business turn until asked',async()=>{
  const h=harness('A');await h.settle();h.value.newChat();await h.settle();
  assert.deepEqual(h.routerNavigations,['/creator/pokemon-collector/shopper']);assert.equal(h.value.ready,false);assert.equal(h.value.thread,null);
  const before=h.requests.length;await h.value.send('blocked during real navigation');assert.equal(h.requests.length,before);
  h.navigate(null);await h.settle();assert.equal(h.value.ready,true);assert.equal(h.value.restoringConversation,false);assert.equal(h.requests.filter(r=>r.operation==='chat-create').length,0);
  await h.value.send('pikacu card');await h.settle();assert.equal(h.value.thread.id,'new-1');assert.equal(h.requests.filter(r=>r.operation==='chat-send').length,1);
  assert.equal(h.routerNavigations.length,1,'the later self-authored URL must not be another server navigation');
  h.dispose();
});

test('explicit history resume still uses true navigation and loads only the requested thread',async()=>{
  const h=harness('A');await h.settle();h.value.resume('B');assert.deepEqual(h.routerNavigations,['/creator/pokemon-collector/shopper?conversation=B']);
  h.navigate('B');await h.settle();assert.equal(h.value.thread.id,'B');assert.equal(h.value.messages[0].text,'Conversation B');assert.deepEqual(h.historyWrites,[]);
  h.dispose();
});

test('true unmount still aborts an active turn and prevents late URL adoption',async()=>{
  const h=harness('A');await h.settle();const hold=h.holdNextSend(),pending=h.value.send('late reply after leaving');await h.settle();
  const request=h.requests.filter(r=>r.operation==='chat-send').at(-1);h.dispose();assert.equal(request.signal.aborted,true);
  hold.resolve();await pending;await h.settle();assert.deepEqual(h.historyWrites,[]);assert.equal(h.value.thread.id,'A');assert.equal(h.value.messages.length,1);
});

test('numeric offer chat cannot select a source-order row when the visible comparison order may differ',async()=>{
  const h=harness(null,{browsingBeta:false});await h.settle();const before=h.requests.length;
  await h.value.send('select offer 1');await h.settle();
  assert.equal(h.value.sheet,'compare');assert.match(h.value.error,/Choose the listing’s Select button/);
  assert.deepEqual(h.selections,[]);assert.equal(h.requests.length,before);assert.deepEqual(h.historyWrites,[]);assert.deepEqual(h.routerNavigations,[]);
  h.dispose();
});
