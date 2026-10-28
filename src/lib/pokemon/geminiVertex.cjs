'use strict';

// Verified GA model/API conventions:
// https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite
// https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/control-generated-output
// This port only returns a JSON proposal. Domain validation and tool admission
// belong to the caller; it never executes a model-selected function.
const DEFAULT_MODEL='gemini-3.5-flash-lite';
const DEFAULT_LOCATION='global';
const MAX_TIMEOUT_MS=8000;
const MAX_INPUT_BYTES=24576,MAX_SCHEMA_BYTES=16384,MAX_RESPONSE_BYTES=65536,MAX_PROPOSAL_BYTES=8192;
const METADATA_TOKEN_URL='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const cancel=response=>{void Promise.resolve().then(()=>response?.body?.cancel()).catch(()=>{});};
function json(value,limit,code){
  let raw;try{raw=JSON.stringify(value);}catch{fail(code);}
  if(typeof raw!=='string'||Buffer.byteLength(raw)>limit)fail(code);
  return raw;
}
function aborted(signal){if(signal?.aborted)fail('gemini_cancelled');}
function raceAbort(promise,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(Object.assign(new Error('gemini_cancelled'),{code:'gemini_cancelled'}));};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
    if(signal.aborted)abort();
  });
}
const validToken=token=>typeof token==='string'&&token.length>=16&&token.length<=16384&&/^[A-Za-z0-9._~+\/-]+=*$/.test(token);
async function responseBytes(response,signal,limit=MAX_RESPONSE_BYTES){
  const length=response.headers?.get('content-length');
  if(length&&/^\d+$/.test(length)&&Number(length)>limit){cancel(response);fail('invalid_gemini_response');}
  const reader=response.body?.getReader();
  if(!reader)fail('invalid_gemini_response');
  const stop=()=>{void Promise.resolve().then(()=>reader.cancel()).catch(()=>{});};
  signal.addEventListener('abort',stop,{once:true});
  const chunks=[];let size=0;
  try{
    for(;;){
      aborted(signal);
      const part=await raceAbort(reader.read(),signal);
      aborted(signal);if(part.done)break;
      size+=part.value.byteLength;
      if(size>limit){stop();fail('invalid_gemini_response');}
      chunks.push(part.value);
    }
    return Buffer.concat(chunks).toString('utf8');
  }finally{
    signal.removeEventListener('abort',stop);
    try{reader.releaseLock();}catch{stop();}
  }
}
function createMetadataAccessToken({fetchImpl=fetch}={}){
  if(typeof fetchImpl!=='function')fail('invalid_gemini_configuration');
  return async ({signal,deadline}={})=>{
    aborted(signal);
    if(deadline!==undefined&&(!Number.isFinite(deadline)||deadline<=Date.now()))fail('gemini_timeout');
    const controller=new AbortController();let timedOut=false;
    const forwardAbort=()=>controller.abort();signal?.addEventListener('abort',forwardAbort,{once:true});
    const duration=Math.min(MAX_TIMEOUT_MS,deadline===undefined?MAX_TIMEOUT_MS:Math.max(1,deadline-Date.now()));
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},duration);
    try{
      const response=await raceAbort(Promise.resolve(fetchImpl(METADATA_TOKEN_URL,{method:'GET',headers:{'Metadata-Flavor':'Google'},redirect:'error',signal:controller.signal}))
        .then(value=>{if(controller.signal.aborted)cancel(value);return value;}),controller.signal);
      if(controller.signal.aborted){cancel(response);aborted(controller.signal);}
      if(response?.status!==200||response.redirected||(response.url&&response.url!==METADATA_TOKEN_URL)||response.headers?.get('metadata-flavor')!=='Google'||
        !/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type')||'')){cancel(response);fail('gemini_auth_unavailable');}
      const value=JSON.parse(await responseBytes(response,controller.signal,24576));
      aborted(controller.signal);
      if(!object(value)||!validToken(value.access_token)||value.token_type!=='Bearer'||!Number.isInteger(value.expires_in)||value.expires_in<1||value.expires_in>3600)fail('gemini_auth_unavailable');
      return value.access_token;
    }catch{
      if(timedOut)fail('gemini_timeout');
      if(controller.signal.aborted)fail('gemini_cancelled');
      fail('gemini_auth_unavailable');
    }finally{clearTimeout(timer);signal?.removeEventListener('abort',forwardAbort);}
  };
}
function parseProposal(raw){
  let response;try{response=JSON.parse(raw);}catch{fail('invalid_gemini_response');}
  if(!object(response)||response.promptFeedback?.blockReason||!Array.isArray(response.candidates)||response.candidates.length!==1)fail('invalid_gemini_response');
  const candidate=response.candidates[0],content=candidate?.content;
  if(candidate?.finishReason!=='STOP'||content?.role!=='model'||!Array.isArray(content.parts)||content.parts.length!==1)fail('invalid_gemini_response');
  const part=content.parts[0];
  if(!object(part)||typeof part.text!=='string'||!part.text.trim()||Object.keys(part).some(key=>!['text','thoughtSignature'].includes(key))||
    (Object.hasOwn(part,'thoughtSignature')&&typeof part.thoughtSignature!=='string')||Buffer.byteLength(part.text)>MAX_PROPOSAL_BYTES)fail('invalid_gemini_response');
  let proposal;try{proposal=JSON.parse(part.text);}catch{fail('invalid_gemini_response');}
  if(!object(proposal))fail('invalid_gemini_response');
  return proposal;
}
function createVertexInterpreter({project,location=DEFAULT_LOCATION,model=DEFAULT_MODEL,getAccessToken,fetchImpl=fetch,
  timeoutMs=MAX_TIMEOUT_MS,maxOutputTokens=512,responseSchema,systemInstruction}={}){
  // The first pilot deliberately admits one reviewed GA model/global endpoint.
  // Neither user input nor a model proposal can choose the URL or credentials.
  if(typeof project!=='string'||!(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)||/^\d{10,20}$/.test(project))||
    location!==DEFAULT_LOCATION||model!==DEFAULT_MODEL||typeof getAccessToken!=='function'||typeof fetchImpl!=='function'||
    !Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>MAX_TIMEOUT_MS||!Number.isInteger(maxOutputTokens)||maxOutputTokens<64||maxOutputTokens>1024||
    !object(responseSchema)||typeof systemInstruction!=='string'||!systemInstruction.trim()||Buffer.byteLength(systemInstruction)>8192)fail('invalid_gemini_configuration');
  const schema=JSON.parse(json(responseSchema,MAX_SCHEMA_BYTES,'invalid_gemini_configuration'));
  const endpoint=`https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:generateContent`;
  return Object.freeze({
    model,location,project,
    async interpret(input,{signal,deadline}={}){
      if(!object(input))fail('invalid_gemini_input');
      const text=json(input,MAX_INPUT_BYTES,'invalid_gemini_input');
      aborted(signal);
      if(deadline!==undefined&&(!Number.isFinite(deadline)||deadline<=Date.now()))fail('gemini_timeout');
      const controller=new AbortController();let timedOut=false;
      const forwardAbort=()=>controller.abort();
      signal?.addEventListener('abort',forwardAbort,{once:true});
      const duration=Math.min(timeoutMs,deadline===undefined?timeoutMs:Math.max(1,deadline-Date.now()));
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},duration);
      try{
        let token;
        try{token=await raceAbort(getAccessToken({signal:controller.signal,deadline:Date.now()+duration}),controller.signal);}
        catch{aborted(controller.signal);fail('gemini_auth_unavailable');}
        aborted(controller.signal);
        if(!validToken(token))fail('gemini_auth_unavailable');
        const body=JSON.stringify({
          systemInstruction:{parts:[{text:systemInstruction}]},
          contents:[{role:'user',parts:[{text}]}],
          generationConfig:{responseMimeType:'application/json',responseSchema:schema,maxOutputTokens,
            thinkingConfig:{thinkingLevel:'MINIMAL'}},
        });
        let response;
        try{response=await raceAbort(Promise.resolve(fetchImpl(endpoint,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
          body,redirect:'error',signal:controller.signal})).then(value=>{if(controller.signal.aborted)cancel(value);return value;}),controller.signal);}
        catch{aborted(controller.signal);fail('gemini_unavailable');}
        if(controller.signal.aborted){cancel(response);aborted(controller.signal);}
        if(response?.status!==200||response.redirected||(response.url&&response.url!==endpoint)){
          cancel(response);
          fail(response?.status===401||response?.status===403?'gemini_access_denied':response?.status===429?'gemini_rate_limited':'gemini_unavailable');
        }
        if(!/^application\/json(?:\s*;|$)/i.test(response.headers?.get('content-type')||'')){cancel(response);fail('invalid_gemini_response');}
        const raw=await responseBytes(response,controller.signal);
        aborted(controller.signal);
        return parseProposal(raw);
      }catch(error){
        if(timedOut)fail('gemini_timeout');
        if(controller.signal.aborted)fail('gemini_cancelled');
        if(['gemini_auth_unavailable','gemini_unavailable','gemini_access_denied','gemini_rate_limited','invalid_gemini_response'].includes(error?.code))fail(error.code);
        fail('gemini_unavailable');
      }finally{clearTimeout(timer);signal?.removeEventListener('abort',forwardAbort);}
    },
  });
}
module.exports={createVertexInterpreter,createMetadataAccessToken,DEFAULT_MODEL,DEFAULT_LOCATION,MAX_TIMEOUT_MS};
