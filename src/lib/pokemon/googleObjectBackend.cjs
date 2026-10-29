'use strict';
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function boundedJSON(response,maxBytes){
  const reader=response.body?.getReader();if(!reader)fail('state_unavailable');
  const chunks=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>maxBytes){await reader.cancel();fail('state_storage_limit');}chunks.push(part.value);}}
  finally{reader.releaseLock();}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('state_unavailable');}
}
// Token stays in process memory. This never reads ADC files, service-account keys or CLI credentials.
function metadataToken(fetchImpl=fetch){
  let cached;
  return async signal=>{
    if(cached&&cached.until>Date.now())return cached.value;
    const response=await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal,redirect:'error'});
    if(response.status!==200)fail('state_auth_unavailable');
    const data=await boundedJSON(response,16384);
    if(typeof data.access_token!=='string'||!Number.isFinite(data.expires_in))fail('state_auth_unavailable');
    cached={value:data.access_token,until:Date.now()+Math.max(0,data.expires_in-60)*1000};return cached.value;
  };
}
function waitFor(promise,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason);
    signal.addEventListener('abort',abort,{once:true});
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    if(signal.aborted)abort();
  });
}
function delay(ms,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.max(0,ms));
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  });
}
function createGoogleObjectBackend({bucket,endpoint='https://storage.googleapis.com',getToken=metadataToken(),fetchImpl=fetch,ioMs=2000,rateLimitRetryMs=0,mutationIntervalMs=0,onFailure=()=>{}}){
  if(!/^[a-z0-9-]{3,63}$/.test(bucket))fail('invalid_state_configuration');
  if(!Number.isInteger(rateLimitRetryMs)||rateLimitRetryMs<0||rateLimitRetryMs>1000)fail('invalid_state_configuration');
  if(!Number.isInteger(mutationIntervalMs)||mutationIntervalMs<0||mutationIntervalMs>1000)fail('invalid_state_configuration');
  const base=endpoint.replace(/\/$/,'');
  const objectPath=key=>'/storage/v1/b/'+bucket+'/o/'+encodeURIComponent(key);
  // Cloud Storage permits one write per second to a single object name. This
  // queue contains timing/ownership only, never object values or read results.
  const mutations=new Map();
  async function transaction(action,deadline=Infinity,operation='read',key){
    const controller=new AbortController(),remaining=Math.min(ioMs,deadline-Date.now());
    if(remaining<=0)fail('state_timeout');
    const timer=setTimeout(()=>controller.abort(),remaining);
    let release,entry,httpStatus=null,attempt=0,phase='admission';const started=Date.now();
    try{
      if(mutationIntervalMs&&['write','remove'].includes(operation)){
        for(const [name,value] of mutations)if(!value.pending&&value.until<=Date.now())mutations.delete(name);
        entry=mutations.get(key);
        if(!entry){if(mutations.size>=1024)fail('state_storage_limit');entry={tail:Promise.resolve(),until:0,pending:0};mutations.set(key,entry);}
        const previous=entry.tail,gate=new Promise(resolve=>{release=resolve;});
        entry.tail=previous.then(()=>gate);entry.pending++;
        await waitFor(previous,controller.signal);
        if(entry.until>Date.now())await delay(entry.until-Date.now(),controller.signal);
        controller.signal.throwIfAborted();
      }
      phase='auth';
      const token=await getToken(controller.signal);
      const request=async(path,options={})=>{
        const {phase:requestPhase='response',limit,...fetchOptions}=options;phase=requestPhase;
        const send=async()=>{
          attempt++;httpStatus=null;
          try{const response=await fetchImpl(base+path,{...fetchOptions,headers:{...fetchOptions.headers,...(token?{Authorization:'Bearer '+token}:{})},signal:controller.signal,redirect:'error'});httpStatus=response.status;return response;}
          finally{if(entry)entry.until=Date.now()+mutationIntervalMs;}
        };
        let response=await send();
        // Only a definite rate-limit rejection is retried, with the same generation
        // precondition and bytes. Never repeat an unknown write outcome or the caller.
        if(response.status===429&&rateLimitRetryMs){
          await response.body?.cancel();
          await delay(Math.max(rateLimitRetryMs,(entry?.until||0)-Date.now()),controller.signal);
          controller.signal.throwIfAborted();
          response=await send();
        }
        if(response.status===404){await response.body?.cancel();return null;}
        if(response.status===412){await response.body?.cancel();fail('state_version_conflict');}
        if(!response.ok){await response.body?.cancel();fail('state_unavailable');}
        if(response.status===204){await response.body?.cancel();return {};}
        return boundedJSON(response,limit||2097152);
      };
      return await action(request);
    }catch(error){
      const code=controller.signal.aborted?'state_timeout':/^state_/.test(error?.code||'')?error.code:'state_unavailable';
      // Fixed fields only: no provider body, object name, cookie, URL or token.
      try{onFailure({operation,phase,http_status:httpStatus,attempt,code,duration_ms:Date.now()-started});}catch{}
      fail(code);
    }
    finally{clearTimeout(timer);if(entry){entry.pending--;release();}}
  }
  return {
    async read(key,deadline){return transaction(async request=>{
      const metadata=await request(objectPath(key)+'?fields=generation,size',{limit:4096,phase:'metadata'});if(!metadata)return null;
      if(!/^\d+$/.test(metadata.generation)||Number(metadata.size)>2097152)fail('state_storage_limit');
      const value=await request(objectPath(key)+'?alt=media&generation='+metadata.generation,{phase:'media'});
      if(!value)fail('state_version_conflict');return {generation:metadata.generation,value};
    },deadline,'read');},
    async write(key,value,generation,deadline){
      const body=JSON.stringify(value);if(Buffer.byteLength(body)>2097152)fail('state_storage_limit');
      return transaction(async request=>{
        const metadata=await request('/upload/storage/v1/b/'+bucket+'/o?uploadType=media&name='+encodeURIComponent(key)+'&ifGenerationMatch='+generation+'&fields=generation',{method:'POST',headers:{'Content-Type':'application/json'},body,limit:4096});
        if(!metadata||!/^\d+$/.test(metadata.generation))fail('state_unavailable');return metadata.generation;
      },deadline,'write',key);
    },
    async remove(key,generation,deadline){return transaction(async request=>{await request(objectPath(key)+'?ifGenerationMatch='+generation,{method:'DELETE'});},deadline,'remove',key);},
    async list(prefix,deadline){return transaction(async request=>{
      const names=[];let token='';
      for(let pages=0;pages<3;pages++){
        const data=await request('/storage/v1/b/'+bucket+'/o?prefix='+encodeURIComponent(prefix)+'&maxResults=200&fields=items(name),nextPageToken'+(token?'&pageToken='+encodeURIComponent(token):''));
        if(!data)fail('state_unavailable');for(const item of data.items||[]){if(typeof item.name!=='string'||!item.name.startsWith(prefix))fail('state_unavailable');names.push(item.name);}
        token=data?.nextPageToken||'';if(!token)return names;
      }fail('state_storage_limit');
    },deadline,'list');},
  };
}
module.exports={createGoogleObjectBackend,metadataToken,boundedJSON};
