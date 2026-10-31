'use strict';
const {betaScope}=require('./betaScope.cjs');
const {cloudTestScope}=require('./cloudTestScope.cjs');
const {createVertexInterpreter,createMetadataAccessToken,DEFAULT_MODEL,DEFAULT_LOCATION}=require('./geminiVertex.cjs');
const {RESPONSE_SCHEMA,SYSTEM_INSTRUCTION,createModelTurnRouter}=require('./modelTurn.cjs');
const fail=()=>{throw Error('invalid_model_configuration');};
function modelConfiguration(env=process.env){
  if(env.POKEMON_CREATOR_MODEL_ENABLED===undefined||env.POKEMON_CREATOR_MODEL_ENABLED==='false')return null;
  if(env.POKEMON_CREATOR_MODEL_ENABLED!=='true'||env.POKEMON_CREATOR_MODEL_PROVIDER!=='vertex')fail();
  // The first integration is confined to the existing authenticated beta or an
  // explicitly scoped private test. It cannot enable the public creator app.
  if(!betaScope(env)&&!cloudTestScope(env))fail();
  if(['POKEMON_COMMERCE_CRAWL_ENABLED','POKEMON_COMMERCE_BNS_ENABLED','POKEMON_COMMERCE_PSA_ENABLED','POKEMON_COMMERCE_BNS_URL_PREVIEW']
    .some(k=>env[k]!=='false'))fail();
  const project=env.POKEMON_CREATOR_MODEL_PROJECT,model=env.POKEMON_CREATOR_MODEL_ID,location=env.POKEMON_CREATOR_MODEL_LOCATION;
  if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project||'')||model!==DEFAULT_MODEL||location!==DEFAULT_LOCATION)fail();
  return {project,model,location,timeoutMs:8000,maxOutputTokens:512};
}
function createRuntimeModelRouter({env=process.env,fetchImpl=globalThis.fetch,getAccessToken}={}){
  const configuration=modelConfiguration(env);
  if(!configuration)return null;
  const client=createVertexInterpreter({...configuration,fetchImpl,
    getAccessToken:getAccessToken||createMetadataAccessToken({fetchImpl}),
    responseSchema:RESPONSE_SCHEMA,systemInstruction:SYSTEM_INSTRUCTION});
  return createModelTurnRouter({interpret:(input,options)=>client.interpret(input,options)});
}
module.exports={modelConfiguration,createRuntimeModelRouter};
