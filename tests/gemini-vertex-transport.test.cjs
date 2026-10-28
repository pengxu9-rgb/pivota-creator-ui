'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createVertexInterpreter,createMetadataAccessToken,DEFAULT_MODEL,MAX_TIMEOUT_MS}=require('../src/lib/pokemon/geminiVertex.cjs');
const schema={type:'OBJECT',properties:{intent:{type:'STRING'}},required:['intent']};
const TOKEN='offline-only-access-token';
const proposal={intent:'status'};
const envelope=(value=proposal)=>({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(value)}]}}]});
const response=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
function config(overrides={}){return {project:'offline-test',getAccessToken:async()=>TOKEN,responseSchema:structuredClone(schema),systemInstruction:'Return the allowed JSON proposal only.',fetchImpl:async()=>response(envelope()),...overrides};}
const code=expected=>error=>{assert.equal(error.code,expected);assert.equal(error.message,expected);assert.equal(Object.hasOwn(error,'cause'),false);return true;};

test('constructor is inert and request binds one verified Vertex model, schema and credential source',async()=>{
  const requests=[];let tokens=0;
  const options=config({getAccessToken:async input=>{tokens++;assert.equal(input.signal instanceof AbortSignal,true);return TOKEN;},fetchImpl:async(url,init)=>{requests.push({url,init});return response(envelope());}});
  const interpreter=createVertexInterpreter(options);assert.equal(tokens,0);assert.equal(requests.length,0);
  options.responseSchema.properties.intent.type='INTEGER';
  const input={text:'Have you recommended any cards?',project:'attacker-project',access_token:'untrusted-input',owner:'another-user'};
  assert.deepEqual(await interpreter.interpret(input),proposal);assert.equal(tokens,1);assert.equal(requests.length,1);
  const {url,init}=requests[0];assert.equal(url,`https://aiplatform.googleapis.com/v1/projects/offline-test/locations/global/publishers/google/models/${DEFAULT_MODEL}:generateContent`);
  assert.equal(init.redirect,'error');assert.equal(init.headers.authorization,'Bearer '+TOKEN);
  const body=JSON.parse(init.body);assert.deepEqual(JSON.parse(body.contents[0].parts[0].text),input);
  assert.deepEqual(body.generationConfig,{responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{intent:{type:'STRING'}},required:['intent']},maxOutputTokens:512,thinkingConfig:{thinkingLevel:'MINIMAL'}});
  assert.equal(Object.hasOwn(body,'tools'),false);assert.equal(Object.hasOwn(body.generationConfig,'candidateCount'),false);
});
test('configuration rejects arbitrary endpoints, preview aliases and excess work budgets',()=>{
  for(const patch of [{project:'bad/project'},{project:'https://evil.invalid'},{location:'us-west1'},{model:'gemini-3-flash-preview'},{model:'gemini-latest'},{timeoutMs:MAX_TIMEOUT_MS+1},{timeoutMs:0},{maxOutputTokens:1025},{getAccessToken:null},{responseSchema:[]},{systemInstruction:''}])
    assert.throws(()=>createVertexInterpreter(config(patch)),code('invalid_gemini_configuration'));
});
test('invalid and oversized input fail without any token or provider request',async()=>{
  let calls=0;const interpreter=createVertexInterpreter(config({getAccessToken:async()=>{calls++;return TOKEN;},fetchImpl:async()=>{calls++;return response(envelope());}}));
  const cyclic={};cyclic.self=cyclic;
  for(const input of [null,[],cyclic,{text:'x'.repeat(24576)}])await assert.rejects(interpreter.interpret(input),code('invalid_gemini_input'));
  assert.equal(calls,0);
});
test('auth failures never disclose credentials or underlying provider errors',async()=>{
  let calls=0;
  for(const getAccessToken of [async()=>{throw Error('private credential '+TOKEN);},async()=>TOKEN+'\nforged',async()=>({token:TOKEN})]){
    const interpreter=createVertexInterpreter(config({getAccessToken,fetchImpl:async()=>{calls++;return response(envelope());}}));
    await assert.rejects(interpreter.interpret({text:'hello'}),code('gemini_auth_unavailable'));
  }
  assert.equal(calls,0);
});
test('provider failures are sanitized and never retried or followed',async()=>{
  for(const [status,expected] of [[301,'gemini_unavailable'],[401,'gemini_access_denied'],[403,'gemini_access_denied'],[429,'gemini_rate_limited'],[503,'gemini_unavailable']]){
    let calls=0;const interpreter=createVertexInterpreter(config({fetchImpl:async()=>{calls++;return new Response(TOKEN,{status,headers:{location:'https://evil.invalid'}});}}));
    await assert.rejects(interpreter.interpret({text:'hello'}),code(expected));assert.equal(calls,1);
  }
  const interpreter=createVertexInterpreter(config({fetchImpl:async()=>{throw Error('provider body '+TOKEN);}}));
  await assert.rejects(interpreter.interpret({text:'hello'}),code('gemini_unavailable'));
});
test('a response-reader exception with a recognized code is still recreated without raw details',async()=>{
  const failure=Object.assign(Error('private reader detail '+TOKEN),{code:'invalid_gemini_response',cause:TOKEN});
  const result={status:200,headers:new Headers({'content-type':'application/json'}),body:{getReader(){return {read:async()=>{throw failure;},releaseLock(){},cancel(){}};}}};
  await assert.rejects(createVertexInterpreter(config({fetchImpl:async()=>result})).interpret({text:'hello'}),code('invalid_gemini_response'));
});
test('only one complete text JSON object is admitted; tool calls and partial results are rejected',async()=>{
  const cases=[{}, {promptFeedback:{blockReason:'SAFETY'},...envelope()}, {candidates:[...envelope().candidates,...envelope().candidates]},
    {candidates:[{...envelope().candidates[0],finishReason:'MAX_TOKENS'}]},
    {candidates:[{finishReason:'STOP',content:{role:'model',parts:[{functionCall:{name:'checkout',args:{}}}]}}]},
    {candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:'{}'},{text:'{}'}]}}]},
    {candidates:[{finishReason:'STOP',content:{role:'user',parts:[{text:'{}'}]}}]},
    {candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:'```json\n{}\n```'}]}}]},
    envelope([]),envelope(null),envelope({text:'x'.repeat(8192)})];
  for(const value of cases){
    const interpreter=createVertexInterpreter(config({fetchImpl:async()=>response(value)}));
    await assert.rejects(interpreter.interpret({text:'hello'}),code('invalid_gemini_response'));
  }
});
test('response byte bound and content-type are enforced before JSON admission',async()=>{
  for(const result of [new Response('x'.repeat(65537),{headers:{'content-type':'application/json'}}),new Response('{}',{headers:{'content-type':'text/html'}}),
    new Response('{}',{headers:{'content-type':'application/json','content-length':'65537'}})]){
    await assert.rejects(createVertexInterpreter(config({fetchImpl:async()=>result})).interpret({text:'hello'}),code('invalid_gemini_response'));
  }
});
test('already aborted or expired requests perform no credential or provider work',async()=>{
  let calls=0;const interpreter=createVertexInterpreter(config({getAccessToken:async()=>{calls++;return TOKEN;}})),controller=new AbortController();controller.abort();
  await assert.rejects(interpreter.interpret({text:'hello'},{signal:controller.signal}),code('gemini_cancelled'));
  await assert.rejects(interpreter.interpret({text:'hello'},{deadline:Date.now()-1}),code('gemini_timeout'));assert.equal(calls,0);
});
test('one shared deadline bounds auth, fetch and a stalled response body even when callbacks ignore cancellation',async()=>{
  const never=()=>new Promise(()=>{});
  await assert.rejects(createVertexInterpreter(config({timeoutMs:5,getAccessToken:never})).interpret({text:'hello'}),code('gemini_timeout'));
  await assert.rejects(createVertexInterpreter(config({timeoutMs:5,fetchImpl:never})).interpret({text:'hello'}),code('gemini_timeout'));
  let cancelled=false;
  const stalled=new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json'}});
  await assert.rejects(createVertexInterpreter(config({timeoutMs:5,fetchImpl:async()=>stalled})).interpret({text:'hello'}),code('gemini_timeout'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true);
});
test('caller cancellation during the provider request stops admission without retry',async()=>{
  const controller=new AbortController();let calls=0;
  const interpreter=createVertexInterpreter(config({fetchImpl:async()=>{calls++;controller.abort();return response(envelope());}}));
  await assert.rejects(interpreter.interpret({text:'hello'},{signal:controller.signal}),code('gemini_cancelled'));assert.equal(calls,1);
});
const metadataResponse=(value={access_token:TOKEN,token_type:'Bearer',expires_in:3599})=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json','metadata-flavor':'Google'}});
test('metadata token provider is inert until called and uses only the fixed default service account endpoint',async()=>{
  const requests=[];const getAccessToken=createMetadataAccessToken({fetchImpl:async(url,init)=>{requests.push({url,init});return metadataResponse();}});
  assert.equal(requests.length,0);assert.equal(await getAccessToken({deadline:Date.now()+1000}),TOKEN);assert.equal(requests.length,1);
  assert.equal(requests[0].url,'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token');
  assert.deepEqual(requests[0].init.headers,{'Metadata-Flavor':'Google'});assert.equal(requests[0].init.redirect,'error');
  assert.equal(Object.hasOwn(requests[0].init,'body'),false);assert.equal(requests[0].init.signal instanceof AbortSignal,true);
});
test('metadata errors, redirects, invalid token data and oversized responses cannot leak credentials',async()=>{
  for(const result of [new Response(TOKEN,{status:403}),new Response(TOKEN,{status:302,headers:{location:'https://evil.invalid'}}),
    metadataResponse({access_token:TOKEN+'\nforged',token_type:'Bearer',expires_in:10}),metadataResponse({access_token:TOKEN,token_type:'Other',expires_in:10}),
    metadataResponse({access_token:TOKEN,token_type:'Bearer',expires_in:0}),metadataResponse({access_token:TOKEN,token_type:'Bearer',expires_in:3601}),
    new Response('x'.repeat(24577),{headers:{'content-type':'application/json','metadata-flavor':'Google'}}),new Response('{}',{headers:{'content-type':'application/json'}})]){
    let calls=0;const getAccessToken=createMetadataAccessToken({fetchImpl:async()=>{calls++;return result;}});
    await assert.rejects(getAccessToken(),code('gemini_auth_unavailable'));assert.equal(calls,1);
  }
  await assert.rejects(createMetadataAccessToken({fetchImpl:async()=>{throw Error(TOKEN);}})(),code('gemini_auth_unavailable'));
});
test('metadata respects preflight cancellation and deadline without a request',async()=>{
  let calls=0;const getAccessToken=createMetadataAccessToken({fetchImpl:async()=>{calls++;return metadataResponse();}}),controller=new AbortController();controller.abort();
  await assert.rejects(getAccessToken({signal:controller.signal}),code('gemini_cancelled'));
  await assert.rejects(getAccessToken({deadline:Date.now()-1}),code('gemini_timeout'));assert.equal(calls,0);
});
test('metadata deadline also bounds a callback that ignores cancellation and a stalled body',async()=>{
  const never=()=>new Promise(()=>{});
  await assert.rejects(createMetadataAccessToken({fetchImpl:never})({deadline:Date.now()+5}),code('gemini_timeout'));
  let cancelled=false;const stalled=new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{'));},cancel(){cancelled=true;}}),{headers:{'content-type':'application/json','metadata-flavor':'Google'}});
  await assert.rejects(createMetadataAccessToken({fetchImpl:async()=>stalled})({deadline:Date.now()+5}),code('gemini_timeout'));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(cancelled,true);
});
