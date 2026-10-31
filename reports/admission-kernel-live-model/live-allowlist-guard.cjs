'use strict';
// Phase A only: one verified TLS destination through one fixed CONNECT proxy.
const fs=require('node:fs'),net=require('node:net'),tls=require('node:tls'),dns=require('node:dns');
const http=require('node:http'),https=require('node:https'),dgram=require('node:dgram'),http2=require('node:http2');
const cp=require('node:child_process'),workers=require('node:worker_threads'),{Readable}=require('node:stream');
const HOST='aiplatform.googleapis.com',PROXY_HOST='127.0.0.1',PROXY_PORT=7897;
const project=process.env.POT_LIVE_PROJECT_ID;
if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project||''))throw Error('live_project_id_required');
if(process.env.POT_LIVE_PROXY!==undefined&&process.env.POT_LIVE_PROXY!=='127.0.0.1:7897')throw Error('invalid_live_proxy');
const endpoint='https://'+HOST+'/v1/projects/'+project+'/locations/global/publishers/google/models/gemini-3.5-flash-lite:generateContent';
const CONNECT='CONNECT aiplatform.googleapis.com:443 HTTP/1.1\r\nHost: aiplatform.googleapis.com:443\r\n\r\n';
const original={Socket:net.Socket,connect:net.Socket.prototype.connect,tls:tls.connect,request:https.request,Agent:https.Agent};
const events=[],activeRequests=new Set(),activeHandles=new Set();let stopped=false,stopReason=null,sequence=0;
function record(kind,requestId,fields={}){events.push({sequence:++sequence,...(requestId?{request_id:requestId}:{}),kind,...fields,time:new Date().toISOString()});}
const coded=code=>Object.assign(new Error(code),{code});
function abortAll(reason='guard_stopped'){
  if(!stopped){stopped=true;stopReason=reason;record('guard_stopped',null,{reason});}
  for(const request of activeRequests)request.destroy(coded(reason));
  for(const handle of activeHandles)handle.destroy(coded(reason));
}
function forbidden(api){record('denied',null,{api});abortAll('live_guard_denied');process.exitCode=1;throw coded('live_guard_denied');}
const deny=api=>function(){return forbidden(api);};
net.connect=net.createConnection=deny('net.connect');net.Socket.prototype.connect=deny('Socket.connect');
net.Server.prototype.listen=deny('Server.listen');tls.connect=deny('tls.connect');
for(const name of Object.keys(dns))if(/^(?:lookup|resolve|reverse)/.test(name)&&typeof dns[name]==='function')dns[name]=deny('dns.'+name);
for(const name of Object.keys(dns.promises))if(/^(?:lookup|resolve|reverse)/.test(name)&&typeof dns.promises[name]==='function')dns.promises[name]=deny('dns.promises.'+name);
for(const prototype of [dns.Resolver?.prototype,dns.promises.Resolver?.prototype])if(prototype)
  for(const name of Object.getOwnPropertyNames(prototype))if(/^(?:resolve|reverse)/.test(name)&&typeof prototype[name]==='function')prototype[name]=deny('Resolver.'+name);
http.request=http.get=deny('http.request');https.request=https.get=deny('https.request');http.ClientRequest=deny('http.ClientRequest');
dgram.createSocket=deny('dgram.createSocket');http2.connect=deny('http2.connect');globalThis.fetch=deny('fetch');
for(const name of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[name]=deny('child_process.'+name);
workers.Worker=deny('Worker');
function auditSnapshot(){return {schema:'pot.admission.live-allowlist-proxy.v2',endpoint,proxy:'127.0.0.1:7897',stopped,stop_reason:stopReason,
  allowed_requests:events.filter(e=>e.kind==='allowed_request').length,proxy_connections:events.filter(e=>e.kind==='proxy_connect').length,
  tls_connections:events.filter(e=>e.kind==='tls_connected').length,denied_attempts:events.filter(e=>e.kind==='denied').length,events:structuredClone(events)};}
function validate(url,options){
  if(typeof url!=='string'||url!==endpoint||!options||options.method!=='POST'||options.redirect!=='error'||
    typeof options.body!=='string'||options.dispatcher!==undefined||options.agent!==undefined)return forbidden('unexpected_request');
  const headers=options.headers;
  if(!headers||Object.keys(headers).sort().join(',')!=='authorization,content-type'||headers['content-type']!=='application/json'||
    typeof headers.authorization!=='string'||!/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(headers.authorization))return forbidden('unexpected_request_headers');
}
function issuer(socket){try{const cn=socket.getPeerCertificate()?.issuer?.CN;return typeof cn==='string'?cn.slice(0,256):null;}catch{return null;}}
async function fetchImpl(url,options){
  validate(url,options);if(stopped)throw coded('live_guard_stopped');
  const requestId=++sequence;events.push({sequence:requestId,kind:'allowed_request',method:'POST',endpoint,time:new Date().toISOString()});
  if(options.signal?.aborted)throw coded('ABORT_ERR');
  return new Promise((resolve,reject)=>{
    let request,cancelled=false;const owned=new Set(),agent=new original.Agent({keepAlive:false,maxSockets:1});
    const remember=handle=>{owned.add(handle);activeHandles.add(handle);handle.once('close',()=>{owned.delete(handle);activeHandles.delete(handle);});return handle;};
    const destroyOwned=reason=>{for(const handle of owned)handle.destroy(coded(reason));};
    const abort=()=>{cancelled=true;request?.destroy(coded('ABORT_ERR'));destroyOwned('ABORT_ERR');};
    const cleanup=()=>{activeRequests.delete(request);options.signal?.removeEventListener('abort',abort);};
    agent.createConnection=function(connectionOptions,callback){
      if(connectionOptions.host!==HOST||Number(connectionOptions.port)!==443)return forbidden('unexpected_tls_destination');
      const socket=remember(new original.Socket());let header=Buffer.alloc(0),settled=false,tunnel=false;
      const complete=(error,transport)=>{if(settled)return;settled=true;if(error)callback(error);else callback(null,transport);};
      const failTunnel=()=>{
        clearTimeout(timer);socket.removeListener('data',readHeader);
        if(cancelled||stopped){complete(coded(stopReason||'ABORT_ERR'));return;}
        record('proxy_tunnel_refused',requestId);abortAll('proxy_tunnel_refused');socket.destroy(coded('proxy_tunnel_refused'));complete(coded('proxy_tunnel_refused'));
      };
      const beginTLS=()=>{
        const transport=remember(original.tls({socket,servername:HOST,rejectUnauthorized:true,ALPNProtocols:['http/1.1']}));
        transport.once('secureConnect',()=>{
          if(cancelled||stopped){transport.destroy(coded(stopReason||'ABORT_ERR'));complete(coded(stopReason||'ABORT_ERR'));return;}
          if(transport.authorized!==true){record('tls_verification_failed',requestId,{issuer_cn:issuer(transport)});abortAll('tls_verification_failed');complete(coded('tls_verification_failed'));return;}
          record('tls_connected',requestId,{authorized:true,issuer_cn:issuer(transport),servername:HOST});complete(null,transport);
        });
        transport.once('error',error=>{
          if(cancelled||stopped){complete(coded(stopReason||'ABORT_ERR'));return;}
          if(/CERT|CERTIFICATE|UNABLE_TO_VERIFY|SELF_SIGNED/.test(String(error?.code||''))){record('tls_verification_failed',requestId,{issuer_cn:issuer(transport)});abortAll('tls_verification_failed');complete(coded('tls_verification_failed'));}
          else{record('tls_transport_error',requestId);complete(coded('live_transport_error'));}
        });
      };
      const readHeader=chunk=>{
        if(cancelled||stopped)return;
        header=Buffer.concat([header,chunk]);const end=header.indexOf('\r\n\r\n');
        if(end<0){if(header.length>8192)failTunnel();return;}
        if(end+4>8192){failTunnel();return;}
        const line=header.subarray(0,header.indexOf('\r\n')).toString('latin1');
        if(!/^HTTP\/1\.[0-9] 200(?:[ \t][\x20-\x7e]*)?$/.test(line)){record('proxy_status',requestId,{status_line:line.slice(0,1024)});failTunnel();return;}
        clearTimeout(timer);socket.removeListener('data',readHeader);socket.pause();tunnel=true;
        const remainder=header.subarray(end+4);if(remainder.length)socket.unshift(remainder);
        record('tunnel_established',requestId,{status_line:line});beginTLS();
      };
      const timer=setTimeout(failTunnel,5000);
      socket.on('data',readHeader);
      socket.once('error',()=>{if(tunnel){if(!cancelled&&!stopped)record('tunnel_socket_error',requestId);complete(coded(stopReason||'live_transport_error'));}else failTunnel();});
      socket.once('connect',()=>{if(cancelled||stopped){socket.destroy(coded(stopReason||'ABORT_ERR'));return;}socket.write(CONNECT);});
      record('proxy_connect',requestId,{host:PROXY_HOST,port:PROXY_PORT,connect_target:HOST+':443'});
      original.connect.call(socket,{host:PROXY_HOST,port:PROXY_PORT,family:4,autoSelectFamily:false});
      // Assignment to HTTPS's agent occurs only after verified TLS succeeds.
      return undefined;
    };
    try{
      request=original.request({hostname:HOST,port:443,path:new URL(endpoint).pathname,method:'POST',
        headers:{authorization:options.headers.authorization,'content-type':'application/json'},agent},response=>{
        record('http_status',requestId,{status:response.statusCode});
        const result=new Response(Readable.toWeb(response),{status:response.statusCode,headers:{'content-type':String(response.headers['content-type']||''),
          ...(response.headers['content-length']?{'content-length':String(response.headers['content-length'])}:{}),}});
        Object.defineProperty(result,'url',{value:endpoint});response.once('end',cleanup);response.once('close',cleanup);resolve(result);
      });
      activeRequests.add(request);request.once('error',()=>{cleanup();reject(coded(stopReason||'live_transport_error'));});
      options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();else request.end(options.body);
    }catch{cleanup();agent.destroy();destroyOwned('live_transport_error');reject(coded(stopReason||'live_transport_error'));}
  });
}
function fatal(){abortAll('live_runtime_failure');process.stderr.write('live_runtime_failure\n');process.exitCode=1;}
process.on('uncaughtException',fatal);process.on('unhandledRejection',fatal);
process.on('exit',()=>fs.writeSync(2,JSON.stringify({live_allowlist_guard_audit:auditSnapshot()})+'\n'));
module.exports=Object.freeze({endpoint,fetchImpl,auditSnapshot,abortAll});
