'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {modelConfiguration,createRuntimeModelRouter}=require('../src/lib/pokemon/modelRuntime.cjs');
const {DEFAULT_MODEL}=require('../src/lib/pokemon/geminiVertex.cjs');
function configuration(){return {K_SERVICE:'pokemon-creator-ui-test',GOOGLE_CLOUD_PROJECT:'pivota-staging',
  POKEMON_CREATOR_TEST_MODE:'true',POKEMON_CREATOR_GOOGLE_ONLY:'true',POKEMON_CREATOR_STATE_DRIVER:'gcs',
  POKEMON_CREATOR_STATE_BUCKET:'pivota-staging-pokemon-ui-test-184498324954',POKEMON_CREATOR_STATE_NAMESPACE:'ui-gemini-offline',
  POKEMON_CREATOR_STATE_STARTED_AT:new Date(Date.now()-60000).toISOString(),POKEMON_CREATOR_STATE_EXPIRES_AT:new Date(Date.now()+3600000).toISOString(),
  POKEMON_COMMERCE_CRAWL_ENABLED:'false',POKEMON_COMMERCE_BNS_ENABLED:'false',POKEMON_COMMERCE_PSA_ENABLED:'false',POKEMON_COMMERCE_BNS_URL_PREVIEW:'false',
  POKEMON_CREATOR_MODEL_ENABLED:'true',POKEMON_CREATOR_MODEL_PROVIDER:'vertex',POKEMON_CREATOR_MODEL_PROJECT:'pivota-staging',
  POKEMON_CREATOR_MODEL_ID:DEFAULT_MODEL,POKEMON_CREATOR_MODEL_LOCATION:'global'};}
test('model is disabled by default and configuration performs no credential or network work',()=>{
  let calls=0;const fail=()=>{calls++;throw Error('unexpected_network');};
  assert.equal(modelConfiguration({}),null);
  assert.equal(createRuntimeModelRouter({env:{},fetchImpl:fail,getAccessToken:fail}),null);
  assert.equal(createRuntimeModelRouter({env:{POKEMON_CREATOR_MODEL_ENABLED:'false'},fetchImpl:fail,getAccessToken:fail}),null);
  assert.equal(calls,0);
});
test('only the authenticated private scope with every provider disabled can enable the pinned Vertex pilot',()=>{
  const env=configuration();assert.equal(modelConfiguration(env).model,DEFAULT_MODEL);
  for(const patch of [{K_SERVICE:'creator-ui'},{POKEMON_CREATOR_GOOGLE_ONLY:'false'},
    {POKEMON_CREATOR_STATE_EXPIRES_AT:new Date(Date.now()-1000).toISOString()},
    {POKEMON_CREATOR_MODEL_PROVIDER:'arbitrary'},{POKEMON_CREATOR_MODEL_ID:'latest'},
    {POKEMON_CREATOR_MODEL_LOCATION:'unreviewed'},{POKEMON_CREATOR_MODEL_PROJECT:'https://attacker.invalid'},
    ...['CRAWL_ENABLED','BNS_ENABLED','PSA_ENABLED','BNS_URL_PREVIEW'].map(k=>({['POKEMON_COMMERCE_'+k]:'true'}))])
    assert.throws(()=>modelConfiguration({...env,...patch}));
});
test('configured runtime reaches the real transport and strict domain router with one injected model request',async()=>{
  let credentials=0,requests=0;
  const route=createRuntimeModelRouter({env:configuration(),getAccessToken:async()=>{credentials++;return 'offline.placeholder.token';},
    fetchImpl:async(url,options)=>{
      requests++;assert.equal(new URL(url).hostname,'aiplatform.googleapis.com');
      const body=JSON.parse(options.body),input=JSON.parse(body.contents[0].parts[0].text);
      assert.equal(body.tools,undefined);assert.equal(input.state_version,7);
      const proposal={schema:'pokemon.interpret-turn.v1',state_version:7,intent:'status',source_spans:[],explanation_key:'none',clarification_field:'none'};
      return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{role:'model',parts:[{text:JSON.stringify(proposal)}]}}]}),{status:200,headers:{'content-type':'application/json'}});
    }});
  assert.equal(requests,0);assert.equal(credentials,0);
  const result=await route({text:'What did you find so far?',doc:{version:7,messages:[]},current:null});
  assert.deepEqual(result.action,{type:'recommendation_status'});assert.equal(result.modelMeta.status,'accepted');
  assert.equal(requests,1);assert.equal(credentials,1);
});
