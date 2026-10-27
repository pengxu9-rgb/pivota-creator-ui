'use strict';
// Test-process preload only: local fixture servers may be used, external hosts may not.
const net=require('node:net'),dns=require('node:dns');
const local=host=>['127.0.0.1','::1','[::1]','localhost'].includes(host);
const deny=()=>{throw Error('offline_network_denied');};
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){
  let values=args;while(Array.isArray(values[0]))values=values[0];
  const first=values[0],host=first&&typeof first==='object'?(first.host||'localhost'):typeof values[1]==='string'?values[1]:'localhost';
  if(first&&typeof first==='object'&&first.path)deny();
  if(typeof first==='string'&&!/^\d+$/.test(first))deny();
  if(!local(host))deny();return connect.apply(this,args);
};
const lookup=dns.lookup;
dns.lookup=function(host,...args){if(!local(host))deny();return lookup.call(this,host,...args);};
const nativeFetch=global.fetch;
global.fetch=function(input,...args){let url;try{url=new URL(typeof input==='string'||input instanceof URL?input:input.url);}catch{deny();}if(!local(url.hostname))deny();return nativeFetch.call(this,input,...args);};
