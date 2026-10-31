'use strict';
// Test preload only. In-memory transports are permitted; every OS network
// capability is denied, including loopback. Child node processes inherit this
// guard through NODE_OPTIONS in the evidence runner.
const marker=Symbol.for('pot.offline.strict-network-guard');
if(!globalThis[marker]){
  const attempts=[];
  const deny=name=>function(){attempts.push(name);throw Object.assign(new Error('network_guard_blocked:'+name),{code:'OFFLINE_NETWORK_DENIED'});};
  const net=require('node:net'),tls=require('node:tls'),dns=require('node:dns'),http=require('node:http'),https=require('node:https'),dgram=require('node:dgram');
  net.connect=net.createConnection=deny('net.connect');
  net.Socket.prototype.connect=deny('Socket.connect');
  net.Server.prototype.listen=deny('Server.listen');
  tls.connect=deny('tls.connect');
  for(const name of Object.keys(dns))if(/^(?:lookup|resolve|reverse)/.test(name)&&typeof dns[name]==='function')dns[name]=deny('dns.'+name);
  for(const name of Object.keys(dns.promises))if(/^(?:lookup|resolve|reverse)/.test(name)&&typeof dns.promises[name]==='function')dns.promises[name]=deny('dns.promises.'+name);
  for(const prototype of [dns.Resolver?.prototype,dns.promises.Resolver?.prototype])if(prototype)
    for(const name of Object.getOwnPropertyNames(prototype))if(/^(?:resolve|reverse)/.test(name)&&typeof prototype[name]==='function')prototype[name]=deny('Resolver.'+name);
  http.request=http.get=deny('http.request');https.request=https.get=deny('https.request');
  http.ClientRequest=deny('http.ClientRequest');
  dgram.createSocket=deny('dgram.createSocket');
  globalThis.fetch=deny('fetch');
  globalThis[marker]={attempts};
  process.on('exit',()=>{
    process.stderr.write(JSON.stringify({strict_network_guard_audit:{pid:process.pid,attempts:[...attempts],count:attempts.length}})+'\n');
    if(attempts.length)process.exitCode=1;
  });
}
module.exports=globalThis[marker];
