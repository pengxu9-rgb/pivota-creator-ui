'use strict';
// The parent always uses the unchanged strict guard. A tightly scoped isolated
// Python child owns a real ephemeral-loopback fake proxy. Its captured reply
// bytes drive VM sockets running the real guard source; TLS verification/failure
// paths use deterministic TLS fakes, never Google, a proxy setting, or a CA.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');
const assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{Readable}=require('node:stream'),{createHash}=require('node:crypto');
const ROOT=path.resolve(__dirname,'../..'),strict=require('../../tests/helpers/strict-network-guard.cjs');
const sourceFile=path.join(__dirname,'live-allowlist-guard.cjs'),source=fs.readFileSync(sourceFile,'utf8');
const sourceHash=createHash('sha256').update(source).digest('hex'),CONNECT='CONNECT aiplatform.googleapis.com:443 HTTP/1.1\r\nHost: aiplatform.googleapis.com:443\r\n\r\n';
const FAKE_CREDENTIAL='synthetic_only_not_a_real_credential_00000000';
const PYTHON=String.raw`import base64,json,socket,sys,threading,time
events=[];denied=[];current={};original_connect=socket.socket.connect;original_bind=socket.socket.bind;original_listen=socket.socket.listen
def fail(name):
 denied.append(name);raise RuntimeError('test_network_denied:'+name)
def audit(event,args):
 if not event.startswith('socket.'):return
 if event=='socket.__new__':
  if args[1]!=socket.AF_INET or args[2]!=socket.SOCK_STREAM:fail(event)
 elif event=='socket.bind':
  if args[0] is not current.get('server') or args[1]!=('127.0.0.1',0):fail(event)
 elif event=='socket.connect':
  if args[1]!=('127.0.0.1',current.get('port')):fail(event)
  events.append({'kind':'authorized_loopback_connect','host':'127.0.0.1','port':current['port']})
 else:fail(event)
sys.addaudithook(audit)
def bind(sock,address):
 if sock is not current.get('server') or address!=('127.0.0.1',0):fail('bind')
 return original_bind(sock,address)
def listen(sock,backlog):
 if sock is not current.get('server') or sock.getsockname()!=('127.0.0.1',current.get('port')):fail('listen')
 return original_listen(sock,backlog)
def connect(sock,address):
 if address!=('127.0.0.1',current.get('port')):fail('connect')
 return original_connect(sock,address)
socket.socket.bind=bind;socket.socket.listen=listen;socket.socket.connect=connect
for name in ['getaddrinfo','gethostbyname','gethostbyname_ex','gethostbyaddr','getnameinfo','create_connection','create_server','socketpair','fromfd']:
 if hasattr(socket,name):setattr(socket,name,lambda *a,_name=name,**k:fail(_name))
expected=b'CONNECT aiplatform.googleapis.com:443 HTTP/1.1\r\nHost: aiplatform.googleapis.com:443\r\n\r\n'
cases=[]
for name in ['success','split','refused','oversized','timeout','wrong_target']:
 server=socket.socket(socket.AF_INET,socket.SOCK_STREAM);current={'server':server};server.bind(('127.0.0.1',0));current['port']=server.getsockname()[1];server.listen(1)
 observed={};response=b'HTTP/1.1 200 Connection established\r\nProxy-Agent: synthetic\r\n\r\n'
 if name=='refused':response=b'HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'
 if name=='oversized':response=b'HTTP/1.1 200 Connection established\r\nX: '+b'x'*8300+b'\r\n\r\n'
 if name=='timeout':response=b''
 def serve():
  connection,_=server.accept()
  with connection:
   incoming=b''
   while b'\r\n\r\n' not in incoming and len(incoming)<8192:
    chunk=connection.recv(1024)
    if not chunk:break
    incoming+=chunk
   observed['target_correct']=incoming==expected
   outgoing=response if incoming==expected else b'HTTP/1.1 403 Forbidden\r\n\r\n'
   if name=='timeout':time.sleep(.04)
   elif name=='split':
    for chunk in [outgoing[:9],outgoing[9:31],outgoing[31:]]:connection.sendall(chunk)
   else:connection.sendall(outgoing)
 thread=threading.Thread(target=serve);thread.start()
 client=socket.socket(socket.AF_INET,socket.SOCK_STREAM);client.settimeout(.01 if name=='timeout' else 2);client.connect(('127.0.0.1',current['port']))
 client.sendall(expected if name!='wrong_target' else expected.replace(b'aiplatform.googleapis.com',b'wrong.invalid'))
 chunks=[]
 try:
  while True:
   chunk=client.recv(2048)
   if not chunk:break
   chunks.append(chunk)
 except TimeoutError:pass
 client.close();thread.join();server.close()
 cases.append({'case':name,'port':current['port'],'target_correct':observed.get('target_correct'),'reply_chunks':[base64.b64encode(c).decode() for c in chunks]})
for name,address in [('wrong_port',('127.0.0.1',current['port']+1)),('direct_google',('aiplatform.googleapis.com',443))]:
 try:
  sock=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
  try:sock.connect(address)
  finally:sock.close()
 except RuntimeError:cases.append({'case':name,'denied_before_os_connect':True})
 else:raise RuntimeError('unexpected_test_egress')
try:socket.getaddrinfo('aiplatform.googleapis.com',443)
except RuntimeError:cases.append({'case':'dns','denied_before_os_lookup':True})
else:raise RuntimeError('unexpected_test_dns')
print(json.dumps({'schema':'pot.guard.local-fake-proxy.v1','cases':cases,'authorized_loopback_connections':len(events),'denied_attempts':denied,'external_connections':0,'signals_sent':0}))
`;
function physicalProxy(){
 const value=cp.spawnSync('python3',['-I','-B','-c',PYTHON],{cwd:ROOT,env:{PATH:process.env.PATH},encoding:'utf8',maxBuffer:2*1024*1024});
 assert.equal(value.error,undefined);assert.equal(value.signal,null);assert.equal(value.status,0,value.stderr);
 const data=JSON.parse(value.stdout);assert.equal(data.authorized_loopback_connections,6);assert.equal(data.external_connections,0);
 for(const row of data.cases.filter(r=>r.reply_chunks))assert.ok(row.port>0&&row.port<=65535);
 return data;
}
function fixture(proxyCases,mode='success',config={}){
 const trace={socket:[],writes:[],tls:[],http:[],stderr:[],exit:[],timers:[],destroy:0};
 const chunks=proxyCases.cases.find(row=>row.case===(mode==='bad_cert'||mode==='tls_pending'||mode==='http_redirect'?'success':mode))?.reply_chunks||[];
 class FakeSocket extends EventEmitter {
  constructor(){super();this.destroyed=false;this.connecting=true;}
  connect(options){trace.socket.push({...options});queueMicrotask(()=>{this.connecting=false;this.emit('connect');});return this;}
  write(data){trace.writes.push(String(data));if(mode==='timeout')return true;queueMicrotask(()=>{for(const value of chunks)this.emit('data',Buffer.from(value,'base64'));});return true;}
  unshift(value){trace.unshifted=(trace.unshifted||0)+value.length;}
  pause(){return this;}resume(){return this;}setTimeout(){return this;}
  destroy(error){if(this.destroyed)return this;this.destroyed=true;trace.destroy++;if(error)queueMicrotask(()=>this.emit('error',error));queueMicrotask(()=>this.emit('close'));return this;}
 }
 class FakeServer{}FakeServer.prototype.listen=()=>{};
 class FakeTransport extends EventEmitter {
  constructor(){super();this.authorized=mode!=='bad_cert';this.destroyed=false;}
  getPeerCertificate(){return {issuer:{CN:'synthetic-test-issuer'}};}
  destroy(error){if(this.destroyed)return this;this.destroyed=true;trace.destroy++;if(error)queueMicrotask(()=>this.emit('error',error));queueMicrotask(()=>this.emit('close'));return this;}
 }
 class FakeAgent {constructor(options){trace.agent=this;this.options=options;}destroy(){trace.agent_destroyed=true;}}
 class FakeRequest extends EventEmitter {
  constructor(options,callback){super();this.options=options;this.callback=callback;this.ended=false;this.responded=false;queueMicrotask(()=>{
   const attach=(error,transport)=>{if(error){this.destroy(error);return;}if(this.transport===transport)return;this.transport=transport;transport.once('error',e=>this.destroy(e));transport.once('secureConnect',()=>{this.secure=true;this.respond();});if(transport._secureEstablished){this.secure=true;this.respond();}};
   try{const transport=options.agent.createConnection({host:config.connectionHost||options.hostname,port:options.port},attach);if(transport)attach(null,transport);}catch(error){this.destroy(error);}
  });}
  end(body){this.body=body;this.ended=true;this.respond();}
  respond(){if(!this.ended||!this.secure||this.responded||mode==='tls_pending')return;this.responded=true;queueMicrotask(()=>{const content=typeof config.responseBody==='function'?config.responseBody(this.body):config.responseBody||'{"synthetic":true}';const response=Readable.from([Buffer.from(content)]);response.statusCode=config.responseStatus??(mode==='http_redirect'?302:200);response.headers={'content-type':'application/json'};this.callback(response);});}
  destroy(error){trace.destroy++;if(!this.destroyed){this.destroyed=true;queueMicrotask(()=>this.emit('error',error||Error('synthetic closed')));}return this;}
 }
 class Resolver{}Resolver.prototype.resolve=()=>{};Resolver.prototype.reverse=()=>{};
 const net={Socket:FakeSocket,Server:FakeServer,connect:()=>{},createConnection:()=>{}};
 const tls={connect:options=>{trace.tls.push(options);const transport=new FakeTransport();queueMicrotask(()=>{
   if(mode==='tls_pending')return;if(mode==='bad_cert'){transport.destroy(Object.assign(Error('synthetic certificate failure'),{code:'CERT_HAS_EXPIRED'}));return;}
   transport._secureEstablished=true;transport.emit('secureConnect');
  });return transport;}};
 const dns={lookup:()=>{throw Error('local DNS must not be used by tunnel');},resolve:()=>{},reverse:()=>{},Resolver,promises:{lookup:()=>{},resolve:()=>{},reverse:()=>{},Resolver}};
 const http={request:()=>{},get:()=>{},ClientRequest:()=>{}},https={Agent:FakeAgent,request:(options,callback)=>{trace.http.push({host:options.hostname,port:options.port,path:options.path,method:options.method,header_names:Object.keys(options.headers)});return new FakeRequest(options,callback);},get:()=>{}};
 const modules={'node:fs':{writeSync:(fd,text)=>trace.exit.push(text)},'node:net':net,'node:tls':tls,'node:dns':dns,'node:http':http,'node:https':https,
  'node:dgram':{createSocket:()=>{}},'node:http2':{connect:()=>{}},'node:child_process':Object.fromEntries(['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'].map(name=>[name,()=>{}])),
  'node:worker_threads':{Worker:class{}},'node:stream':{Readable}};
 const processFake=new EventEmitter();processFake.env={POT_LIVE_PROJECT_ID:'audit-project-123',...(config.proxy!==undefined?{POT_LIVE_PROXY:config.proxy}:{})};processFake.stderr={write:value=>trace.stderr.push(value)};
 const sandbox={module:{exports:{}},exports:{},require:name=>{assert.ok(modules[name],'unexpected guard dependency '+name);return modules[name];},process:processFake,URL,Response,Buffer,structuredClone,Date,
  setTimeout:(callback,duration)=>{trace.timers.push(duration);return setTimeout(callback,duration===5000?12:duration);},clearTimeout};
 vm.runInNewContext(source,sandbox,{filename:'real-guard-under-test.cjs'});
 const options=()=>({method:'POST',redirect:'error',headers:{authorization:'Bearer '+FAKE_CREDENTIAL,'content-type':'application/json'},body:'{"synthetic":true}'});
 return {api:sandbox.module.exports,options,trace,processFake,sandbox,modules};
}
async function main(outputDirectory){
 assert.match(process.env.NODE_OPTIONS||'',/strict-network-guard\.cjs/);assert.ok(outputDirectory,'external output directory required');
 const out=path.resolve(outputDirectory);assert.ok(out!==ROOT&&!out.startsWith(ROOT+path.sep));assert.equal(fs.existsSync(path.join(out,'guard-tests.json')),false,'preserve previous test evidence');fs.mkdirSync(out,{recursive:true});
 const physical=physicalProxy(),results=[];
 const finish=(name,f)=>{f.processFake.emit('exit');const audit=f.api.auditSnapshot();assert.ok(!JSON.stringify(audit).includes(FAKE_CREDENTIAL));assert.ok(!f.trace.stderr.join('').includes(FAKE_CREDENTIAL));assert.ok(!f.trace.exit.join('').includes(FAKE_CREDENTIAL));results.push({case:name,passed:true,allowed_requests:audit.allowed_requests,denied_attempts:audit.denied_attempts,stopped:audit.stopped,stop_reason:audit.stop_reason||audit.fatal_reason||null});};
 for(const mode of ['success','split']){const f=fixture(physical,mode),response=await f.api.fetchImpl(f.api.endpoint,f.options());assert.equal(response.status,200);assert.deepEqual(await response.json(),{synthetic:true});
  assert.equal(f.trace.socket.length,1);assert.equal(f.trace.socket[0].host,'127.0.0.1');assert.equal(f.trace.socket[0].port,7897);assert.equal(f.trace.writes.join(''),CONNECT);
  assert.equal(f.trace.tls.length,1);assert.equal(f.trace.tls[0].servername,'aiplatform.googleapis.com');assert.equal(f.trace.tls[0].rejectUnauthorized,true);assert.equal(f.trace.tls[0].ca,undefined);
  const events=f.api.auditSnapshot().events;assert.ok(events.some(e=>e.kind==='proxy_connect'));assert.ok(events.some(e=>e.kind==='tunnel_established'));assert.ok(events.some(e=>e.kind==='tls_connected'&&e.authorized===true));assert.ok(!events.some(e=>e.kind==='dns_lookup'));
  assert.equal(f.trace.http[0].path,new URL(f.api.endpoint).pathname);finish('verified proxy '+mode,f);}
 for(const mode of ['refused','oversized','timeout','bad_cert']){const f=fixture(physical,mode);await assert.rejects(f.api.fetchImpl(f.api.endpoint,f.options()));assert.ok(f.api.auditSnapshot().stopped);if(mode!=='bad_cert')assert.equal(f.trace.tls.length,0);if(mode==='timeout')assert.ok(f.trace.timers.includes(5000));finish('reject '+mode,f);}
 for(const proxy of ['127.0.0.1:7898','localhost:7897','https://127.0.0.1:7897','aiplatform.googleapis.com:443','127.0.0.1:7897/'])assert.throws(()=>fixture(physical,'success',{proxy}));results.push({case:'wrong proxy address, hostname, port and URL rejected before connection',passed:true});
 const wrong=fixture(physical,'success',{connectionHost:'wrong.invalid'});await assert.rejects(wrong.api.fetchImpl(wrong.api.endpoint,wrong.options()));assert.equal(wrong.trace.socket.length,0);finish('wrong CONNECT target rejected before connection',wrong);
 const denied=async(name,change)=>{const f=fixture(physical);const [url,options]=change(f.api.endpoint,f.options());await assert.rejects(f.api.fetchImpl(url,options));assert.equal(f.trace.socket.length,0);finish(name,f);};
 for(const [name,transform]of [['other endpoint',url=>url.replace(':generateContent',':countTokens')],['other model',url=>url.replace('gemini-3.5-flash-lite','other')],['other project',url=>url.replace('audit-project-123','other-project-456')],['other host',url=>url.replace('aiplatform.googleapis.com','wrong.invalid')],['query',url=>url+'?x=1'],['explicit port',url=>url.replace('.com/','.com:443/')],['URL credentials',url=>url.replace('https://','https://synthetic@')],['trailing slash',url=>url+'/'],['URL object',url=>new URL(url)]])await denied(name,(url,options)=>[transform(url),options]);
 for(const method of ['GET','CONNECT','PUT','DELETE'])await denied('deny HTTP method '+method,(url,options)=>[url,{...options,method}]);
 for(const redirect of ['follow','manual'])await denied('deny redirect '+redirect,(url,options)=>[url,{...options,redirect}]);
 for(const key of ['dispatcher','agent'])await denied('deny custom '+key,(url,options)=>[url,{...options,[key]:{}}]);
 for(const [module,key]of [['node:net','connect'],['node:tls','connect'],['node:dns','lookup'],['node:http','request'],['node:https','request'],['node:dgram','createSocket'],['node:http2','connect'],['node:child_process','spawn'],['node:worker_threads','Worker']]){const f=fixture(physical);assert.throws(()=>f.modules[module][key]({host:'aiplatform.googleapis.com',port:443}));assert.equal(f.trace.socket.length,0);finish('deny direct '+module+'.'+key,f);}
 const stalled=fixture(physical,'tls_pending'),controller=new AbortController(),pending=stalled.api.fetchImpl(stalled.api.endpoint,{...stalled.options(),signal:controller.signal});setTimeout(()=>controller.abort(),30);await assert.rejects(pending);assert.ok(stalled.api.auditSnapshot().events.some(e=>e.kind==='tunnel_established'));assert.ok(!stalled.api.auditSnapshot().events.some(e=>e.kind==='tls_connected'));finish('tunnel established but TLS never completes',stalled);
 assert.equal(createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex'),sourceHash,'guard source changed during tests');assert.equal(strict.attempts.length,0);
 const childSummary={...physical,cases:physical.cases.map(({reply_chunks,...rest})=>({...rest,...(reply_chunks?{reply_bytes:reply_chunks.reduce((n,b)=>n+Buffer.from(b,'base64').length,0)}:{})}))};
 const report={schema:'pot.admission.proxy-guard-tests.v1',guard_sha256:sourceHash,cases:results,tests:results.length,passed:true,parent_strict_network_attempts:0,
  local_fake_proxy:childSummary,network_scope:'Only the isolated child creates real loopback connections to its own ephemeral fake proxy. The parent VM runs real guard source with captured proxy reply bytes; TLS is mocked and no certificate/CA or external connection is created.',signals_sent:0,real_credential_values_read:false};
 fs.writeFileSync(path.join(out,'guard-tests.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({tests:results.length,passed:true,parent_strict_network_attempts:0,authorized_child_loopback_connections:physical.authorized_loopback_connections,external_connections:0,guard_sha256:sourceHash}));return report;
}
module.exports={main,physicalProxy,fixture};
if(require.main===module)main(process.argv[2]).catch(error=>{console.error(error);process.exitCode=1;});
