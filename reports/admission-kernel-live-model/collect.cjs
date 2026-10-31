'use strict';
// Phase A. The token enters only on stdin, after the corpus commit is frozen.
// Never log exceptions, headers, response bodies, the token or a token hash.
// Round 9 permits only a preflight-400 error.message, bounded and credential-redacted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const allow=require('./live-allowlist-guard.cjs');
const {createVertexInterpreter}=require('../../src/lib/pokemon/geminiVertex.cjs');
const {buildModelInput,RESPONSE_SCHEMA,SYSTEM_INSTRUCTION}=require('../../src/lib/pokemon/modelTurn.cjs');
const {modelConfiguration}=require('../../src/lib/pokemon/modelRuntime.cjs');
const dynamic=require('./dynamic-context.cjs');
const ROOT=path.resolve(__dirname,'../..'),sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const MAX_CALLS=1000,MAX_INPUT_TOKENS=5000000,CONCURRENCY=2;
const safeCodes=new Set(['gemini_timeout','gemini_rate_limited','gemini_access_denied','gemini_auth_unavailable','gemini_unavailable','gemini_cancelled','invalid_gemini_response']);
const usageKeys=['promptTokenCount','candidatesTokenCount','thoughtsTokenCount','cachedContentTokenCount','totalTokenCount'];
function futurePath(file){let p=path.resolve(file),tail=[];while(!fs.existsSync(p)){tail.unshift(path.basename(p));p=path.dirname(p);}return path.join(fs.realpathSync(p),...tail);}
function localConfiguration(project){const now=Date.now();return {
  K_SERVICE:'pokemon-creator-ui-test',GOOGLE_CLOUD_PROJECT:'pivota-staging',POKEMON_CREATOR_TEST_MODE:'true',
  POKEMON_CREATOR_GOOGLE_ONLY:'true',POKEMON_CREATOR_STATE_DRIVER:'gcs',POKEMON_CREATOR_STATE_BUCKET:'pivota-staging-pokemon-ui-test-184498324954',
  POKEMON_CREATOR_STATE_NAMESPACE:'ui-live-model-check',POKEMON_CREATOR_STATE_STARTED_AT:new Date(now-60000).toISOString(),
  POKEMON_CREATOR_STATE_EXPIRES_AT:new Date(now+7200000).toISOString(),POKEMON_CREATOR_MODEL_ENABLED:'true',
  POKEMON_CREATOR_MODEL_PROVIDER:'vertex',POKEMON_CREATOR_MODEL_PROJECT:project,POKEMON_CREATOR_MODEL_ID:'gemini-3.5-flash-lite',
  POKEMON_CREATOR_MODEL_LOCATION:'global',POKEMON_COMMERCE_CRAWL_ENABLED:'false',POKEMON_COMMERCE_BNS_ENABLED:'false',
  POKEMON_COMMERCE_PSA_ENABLED:'false',POKEMON_COMMERCE_BNS_URL_PREVIEW:'false',
};}
async function main(project,expectedCorpusSha,rawDirectory){
  assert.ok(/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project||''),'named_project_required');
  assert.equal(process.env.POT_LIVE_PROJECT_ID,project);assert.match(expectedCorpusSha||'',/^[a-f0-9]{64}$/);
  const corpusBytes=fs.readFileSync(path.join(__dirname,'corpus.json'));assert.equal(sha(corpusBytes),expectedCorpusSha,'frozen_corpus_mismatch');
  assert.equal(expectedCorpusSha,"c1c9912e16c7a491387f8d3e24c59493bfce5fd4f6437a72eaecaa9f26dafd73",'original_AD_corpus_required');
  assert.equal(sha(fs.readFileSync(ROOT+'/src/lib/pokemon/modelTurn.cjs')),"432b0a6b5060eb97caf318d399fd9acb7c4ca8960099e5ef3581b73765378b63",'validated_product_source_required');
  const corpus=JSON.parse(corpusBytes);assert.equal(corpus.entries.length,349,'original_AD_count');
  const holdoutBytes=fs.readFileSync(path.join(__dirname,'holdout-e.json'));
  assert.equal(sha(holdoutBytes),"dc63d42daf62ddd6ca0a643eb0ddad42a9dcf5fa591f9708b84ac91234bd4997",'frozen_holdout_mismatch');
  const holdout=JSON.parse(holdoutBytes);assert.equal(holdout.fix_commit,"cf5f7b1e642302593af0cd6bf694f8616a6a840f",'holdout_requires_product_fix_commit');
  assert.equal(holdout.corpus_sha256,expectedCorpusSha);assert.match(holdout.source_sha256,/^[a-f0-9]{64}$/);
  assert.equal(holdout.entries.length,40);assert.ok(holdout.entries.every(entry=>entry.sets.length===1&&entry.sets[0]==='E'),'holdout_set_E_only');
  const entries=[...corpus.entries,...holdout.entries];assert.equal(entries.length,389);
  const ids=new Set(entries.map(e=>e.id));assert.equal(ids.size,entries.length);
  for(const entry of entries)for(const dependency of entry.depends_on||[])assert.ok(ids.has(dependency)&&dependency!==entry.id,'invalid_flow_dependency');
  const ready=new Set(),remaining=new Map(entries.map(e=>[e.id,e]));
  while(remaining.size){const next=[...remaining.values()].find(e=>(e.depends_on||[]).every(id=>ready.has(id)));assert.ok(next,'corpus_dependency_cycle');remaining.delete(next.id);ready.add(next.id);}
  for(const entry of entries)assert.equal(sha(JSON.stringify(buildModelInput({...structuredClone(entry.context),text:entry.text}))),entry.input_sha256,'frozen_input_mismatch');
  const raw=futurePath(rawDirectory);assert.ok(raw!==ROOT&&!raw.startsWith(ROOT+path.sep),'raw_output_inside_repository');
  assert.equal(fs.existsSync(raw),false,'preserve_previous_collection_attempt');fs.mkdirSync(raw,{recursive:true});
  const proposalsPath=path.join(__dirname,'proposals.json');assert.equal(fs.existsSync(proposalsPath),false,'live_collection_must_not_overwrite_proposals');
  const env=localConfiguration(project),configuration=modelConfiguration(env); // exactly once; only this explicit object is read.
  assert.equal(configuration.timeoutMs,8000);assert.equal(configuration.maxOutputTokens,512);
  const expiry=Date.parse(process.env.POT_LIVE_TOKEN_EXPIRES_AT);assert.ok(Number.isFinite(expiry)&&expiry>=Date.now()+45*60000,'cached_token_requires_45_minutes_at_launch');
  // Deliberately do not compute a digest of this value or include it in state.
  let token=fs.readFileSync(0,'utf8').trim();assert.ok(token.length>=16&&token.length<=16384&&/^[A-Za-z0-9._~+\/-]+=*$/.test(token),'invalid_local_access_token');
  const ledger={calls:0,retries:0,http_429:0,consecutive_429:0,consecutive_without_tls:0,consecutive_tls_timeouts:0,completed_calls:0,schema_not_enforced:null,prompt_tokens:0,candidate_tokens:0,thought_tokens:0,
    unknown_input_upper_bound:0,in_flight_input_reservation:0,stop_reason:null};
  const abort=new AbortController(),records=[],attempts=[],allTasks=new Set(),allFetches=new Set();let active=0,maxActive=0;
  const started=new Date().toISOString(),receivedSignals=[];
  const preflight={turn_id:entries[0].id,pass:1,attempted:false,passed:false,http_status:null,stage_reached:'not_started',usage_metadata_valid:false,error_code:null,error_message:null,error_message_unavailable:null};
  function stop(reason){if(!ledger.stop_reason){ledger.stop_reason=reason;allow.abortAll(reason);abort.abort();}}
  const conservativeTotal=()=>ledger.prompt_tokens+ledger.unknown_input_upper_bound+ledger.in_flight_input_reservation;
  function requestStage(guard,requestId,status){
    const events=guard.events.filter(event=>event.request_id===requestId||event.kind==='allowed_request'&&event.sequence===requestId);
    const connected=events.find(event=>event.kind==='tls_connected'),http=events.findLast(event=>event.kind==='http_status');
    const actualStatus=status??http?.status??http?.http_status??null;
    const stage=actualStatus!==null?'http_status':connected?'tls_connected':events.some(event=>event.kind==='tunnel_established')?'tunnel_established':events.some(event=>event.kind==='proxy_connect')?'proxy_connect':'not_started';
    return {stage_reached:stage,tls_connected:!!connected,tls_authorized:connected?.authorized===true,
      tls_issuer_cn:connected?.issuer_cn??connected?.issuer_CN??null,http_status:actualStatus};
  }
  function snapshot(guard=allow.auditSnapshot()){
    const requests=guard.events.filter(event=>event.kind==='allowed_request').map(event=>({allowed:true,method:'POST',url:allow.endpoint,request_id:event.sequence,
      ...requestStage(guard,event.sequence,null)}));
    return {schema:'pot.admission.live-proposals.v1',attempt_id:4,corpus_sha256:expectedCorpusSha,
      source_base:'01382ad6fd97afa816ed9e08bec9e2a055107ffd',holdout_fix_commit:holdout.fix_commit,holdout_e_sha256:sha(holdoutBytes),holdout_e_source_sha256:holdout.source_sha256,
      frozen_input_hashes_verified:{A_D:corpus.entries.length,E:holdout.entries.length},project,model:configuration.model,location:configuration.location,
      configuration_check:{passed:true,configuration,local_only:true,deployed_settings_changed:false,env},
      limits:{calls:MAX_CALLS,input_tokens:MAX_INPUT_TOKENS,concurrency:CONCURRENCY},
      preflight:structuredClone(preflight),received_signals:structuredClone(receivedSignals),
      started_at:started,finished_at:ledger.stop_reason||records.length===entries.length*2?new Date().toISOString():null,
      stats:{...ledger,max_concurrency:maxActive,remaining_calls:MAX_CALLS-ledger.calls,
        remaining_input_tokens_conservative:MAX_INPUT_TOKENS-conservativeTotal(),unknown_input_accounting:'unreported usage retains UTF-8 body bytes +4096 reservation'},
      complete:records.length===entries.length*2&&!ledger.stop_reason&&!records.some(row=>row.not_run),records,
      guard_receipt:{passed:guard.denied_attempts===0,allowed_endpoint:allow.endpoint,denied_attempts:guard.denied_attempts,
        proxy:{host:'127.0.0.1',port:7897,connect_target:'aiplatform.googleapis.com:443'},attempts:requests,
        stage_counts:Object.fromEntries(['not_started','proxy_connect','tunnel_established','tls_connected','http_status'].map(stage=>[stage,requests.filter(row=>row.stage_reached===stage).length])),
        tls_issuer_cns:[...new Set(requests.map(row=>row.tls_issuer_cn).filter(value=>typeof value==='string'))].sort()},
    };}
  function atomic(file,bytes){fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);}
  function save(){
    const guard=allow.auditSnapshot(),state=snapshot(guard);atomic(proposalsPath,JSON.stringify(state)+'\n');
    atomic(path.join(raw,'collection-state.json'),JSON.stringify({...state,full_guard_receipt:guard})+'\n');
    atomic(path.join(raw,'guard-receipt.json'),JSON.stringify(guard)+'\n');
  }
  function onSignal(signal){receivedSignals.push({signal,time:new Date().toISOString()});stop('received_'+signal);try{save();}catch{process.stderr.write('collection_checkpoint_failed\n');process.exitCode=1;}}
  const onInterrupt=()=>onSignal('SIGINT'),onTerminate=()=>onSignal('SIGTERM');
  process.on('SIGINT',onInterrupt);process.on('SIGTERM',onTerminate);
  async function runTurn(entry,pass){
    const state=entry.sets.includes('C')?await dynamic.contextFor(entry,pass,records):null;
    if(state?.unreachable){records.push({turn_id:entry.id,pass,not_run:true,error_code:'dynamic_context_unavailable',reason:state.reason,
      proposal:null,http_status:null,latency_ms:0,input_sha256:null,usageMetadata:null,attempts:[],provenance:state.provenance});save();return;}
    const context={...structuredClone(state?.context||entry.context),text:entry.text},input=buildModelInput(context),inputHash=sha(JSON.stringify(input));
    if(!state)assert.equal(inputHash,entry.input_sha256,'frozen_input_mismatch');
    const turnAttempts=[],turnFetches=new Set();let proposal=null,errorCode=null;const turnStarted=Date.now(),isPreflight=ledger.calls===0;
    const counted=async(url,options)=>{
      if(ledger.stop_reason)throw Object.assign(new Error('collection_stopped'),{code:'collection_stopped'});
      if(Date.now()+15000>=expiry){stop('cached_token_expiring');throw Object.assign(new Error('collection_stopped'),{code:'collection_stopped'});}
      const reservation=Buffer.byteLength(options.body,'utf8')+4096;
      if(ledger.calls>=MAX_CALLS){stop('call_cap');throw Object.assign(new Error('collection_stopped'),{code:'collection_stopped'});}
      if(conservativeTotal()+reservation>MAX_INPUT_TOKENS){stop('input_token_cap');throw Object.assign(new Error('collection_stopped'),{code:'collection_stopped'});}
      ledger.calls++;ledger.in_flight_input_reservation+=reservation;active++;maxActive=Math.max(maxActive,active);assert.ok(active<=CONCURRENCY);
      const row={turn_id:entry.id,pass,attempt:turnAttempts.length+1,call_index:ledger.calls,status:null,latency_ms:0,usageMetadata:null,input_sha256:inputHash,input_token_reservation:reservation,request_id:null};
      attempts.push(row);turnAttempts.push(row);let usage=null,response,start=Date.now();
      try{
        const beforeSequence=allow.auditSnapshot().events.at(-1)?.sequence||0,pendingResponse=allow.fetchImpl(url,options);
        row.request_id=allow.auditSnapshot().events.find(event=>event.kind==='allowed_request'&&event.sequence>beforeSequence)?.sequence??null;
        response=await pendingResponse;row.status=response.status;
        if(response.status===429){ledger.http_429++;ledger.consecutive_429++;if(ledger.consecutive_429>=3)stop('three_consecutive_429');}
        else ledger.consecutive_429=0;
                if(response.status!==200){
          if(isPreflight&&response.status>=400&&response.status<500){
            const reader=response.body?.getReader(),chunks=[];let size=0;
            if(!reader)preflight.error_message_unavailable='response_body_missing';
            else try{
              for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;
                if(size>65536){await reader.cancel();throw Error('response_body_too_large');}chunks.push(part.value);}
              const message=JSON.parse(Buffer.concat(chunks).toString('utf8'))?.error?.message;
              if(typeof message==='string')preflight.error_message=message.replaceAll(token,'[credential omitted]').slice(0,8192);
              else preflight.error_message_unavailable='error_message_missing';
            }catch{preflight.error_message_unavailable='error_message_unreadable_or_oversized';}
            finally{try{reader.releaseLock();}catch{}}
          }
          if(response.status===401||response.status===403)stop('gemini_access_denied');else if(response.status!==429)stop('vertex_http_'+response.status);return response;
        }
        const reader=response.body.getReader(),chunks=[];let size=0;
        try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();throw Object.assign(new Error('invalid_gemini_response'),{code:'invalid_gemini_response'});}chunks.push(part.value);}}
        finally{try{reader.releaseLock();}catch{}}
        const bytes=Buffer.concat(chunks);let envelope;
        try{envelope=JSON.parse(bytes.toString('utf8'));}catch{stop('missing_usage_metadata');throw Object.assign(new Error('invalid_gemini_response'),{code:'invalid_gemini_response'});}
        const source=envelope?.usageMetadata;
        if(!source||!Number.isSafeInteger(source.promptTokenCount)||source.promptTokenCount<1||
          usageKeys.some(key=>Object.hasOwn(source,key)&&(!Number.isSafeInteger(source[key])||source[key]<0))){stop('missing_usage_metadata');throw Object.assign(new Error('invalid_gemini_response'),{code:'invalid_gemini_response'});}
        usage=Object.fromEntries(usageKeys.filter(key=>Number.isSafeInteger(source[key])&&source[key]>=0).map(key=>[key,source[key]]));row.usageMetadata=usage;
        if(usage.promptTokenCount>reservation){stop('token_upper_bound_violation');throw Object.assign(new Error('usage_bound'),{code:'usage_bound'});}
        const copy=new Response(bytes,{status:response.status,headers:{'content-type':response.headers.get('content-type')||''}});
        Object.defineProperty(copy,'url',{value:allow.endpoint});return copy;
      }finally{
        const receipt=allow.auditSnapshot();Object.assign(row,requestStage(receipt,row.request_id,row.status));
        if(['proxy_tunnel_refused','tls_verification_failed','live_guard_denied'].includes(receipt.stop_reason))stop(receipt.stop_reason);
        row.latency_ms=Date.now()-start;active--;ledger.in_flight_input_reservation-=reservation;
        if(usage){ledger.prompt_tokens+=usage.promptTokenCount;ledger.candidate_tokens+=usage.candidatesTokenCount||0;ledger.thought_tokens+=usage.thoughtsTokenCount||0;}
        else ledger.unknown_input_upper_bound+=reservation;
        if(conservativeTotal()>MAX_INPUT_TOKENS)stop('input_token_cap_violation');
        row.completed_call_index=++ledger.completed_calls;
        fs.appendFileSync(path.join(raw,'attempts.jsonl'),JSON.stringify(row)+'\n');
      }
    };
    const countingFetch=(...args)=>{const pending=counted(...args).finally(()=>{allFetches.delete(pending);turnFetches.delete(pending);});allFetches.add(pending);turnFetches.add(pending);return pending;};
    const client=createVertexInterpreter({...configuration,getAccessToken:async()=>token,fetchImpl:countingFetch,
      responseSchema:RESPONSE_SCHEMA,systemInstruction:SYSTEM_INSTRUCTION});
    for(let attempt=0;attempt<2;attempt++){
      let interpreted=false;
      try{proposal=await client.interpret(input,{signal:abort.signal});errorCode=null;interpreted=true;}
      catch(error){
        const status=turnAttempts.at(-1)?.status;
        errorCode=status===401||status===403?'gemini_access_denied':safeCodes.has(error?.code)?error.code:'model_unavailable';
      }
      await Promise.allSettled(turnFetches);
      const last=turnAttempts.at(-1);
      if(last){
        last.error_code=errorCode;
        if(last.tls_connected)ledger.consecutive_without_tls=0;else ledger.consecutive_without_tls++;
        if(last.tls_connected&&errorCode==='gemini_timeout')ledger.consecutive_tls_timeouts++;else ledger.consecutive_tls_timeouts=0;
        if(ledger.consecutive_without_tls>=3)stop('transport_unreachable');
        if(ledger.consecutive_tls_timeouts>=10)stop('vertex_persistently_slow');
      }
      if(isPreflight){
        preflight.attempted=!!last;preflight.http_status=last?.status??null;preflight.stage_reached=last?.stage_reached||'not_started';
        preflight.usage_metadata_valid=!!last?.usageMetadata&&Number.isSafeInteger(last.usageMetadata.promptTokenCount)&&last.usageMetadata.promptTokenCount>0;
        preflight.passed=turnAttempts.length===1&&last?.status===200&&preflight.usage_metadata_valid&&!ledger.stop_reason&&errorCode!=='gemini_timeout';preflight.error_code=errorCode;
        if(!preflight.passed)stop('preflight_failed');
      }
      if(interpreted)break;
      if(!isPreflight&&errorCode==='gemini_rate_limited'&&attempt===0&&!ledger.stop_reason){ledger.retries++;await new Promise(resolve=>setTimeout(resolve,1000));continue;}
      break;
    }
    const lastCompleted=turnAttempts.at(-1);
    if(lastCompleted?.completed_call_index<=60&&['clarify','explain','reply','status','unsupported'].includes(proposal?.intent)&&
      Array.isArray(proposal.source_spans)&&proposal.source_spans.length>0&&!ledger.stop_reason){
      ledger.schema_not_enforced={turn_id:entry.id,pass,intent:proposal.intent,call_index:lastCompleted.call_index,completed_call_index:lastCompleted.completed_call_index};
      // Soft stop: schedule no more calls; allow the other in-flight request
      // to finish normally. Unlike hard stops, do not abort or signal it.
      ledger.stop_reason='schema_not_enforced';
    }
    if(turnAttempts.length){records.push({turn_id:entry.id,pass,proposal,error_code:errorCode,http_status:turnAttempts.at(-1).status,
      latency_ms:Date.now()-turnStarted,usageMetadata:turnAttempts.at(-1).usageMetadata,input_sha256:inputHash,attempts:turnAttempts,
      ...(state?{context:state.context,model_off_plan:state.model_off.plan,provenance:state.provenance,frozen_input_sha256:entry.input_sha256}:{})});save();
      process.stdout.write(JSON.stringify({turn_id:entry.id,pass,calls:ledger.calls,completed_turns:records.length,prompt_tokens:ledger.prompt_tokens,stop_reason:ledger.stop_reason})+'\n');}
    if(allow.auditSnapshot().denied_attempts)stop('live_guard_denied');
  }
  try{
    // Establish access with the first regular corpus turn before scheduling a
    // second request. This costs no extra test call and fails closed on403.
    let first=true;
    for(const pass of [1,2]){
      const pending=new Map(entries.map(e=>[e.id,e])),done=new Set(),running=new Map();
      while((pending.size||running.size)&&!ledger.stop_reason){
        for(;;){
          const limit=first?1:CONCURRENCY;if(running.size>=limit||ledger.stop_reason)break;
          const entry=[...pending.values()].find(e=>(e.depends_on||[]).every(id=>done.has(id)));if(!entry)break;
          pending.delete(entry.id);const task=runTurn(entry,pass).finally(()=>{done.add(entry.id);running.delete(entry.id);allTasks.delete(task);first=false;});running.set(entry.id,task);allTasks.add(task);
        }
        if(!running.size&&pending.size)throw Error('corpus_dependency_cycle');
        if(running.size)await Promise.race(running.values());
      }
      await Promise.allSettled(running.values());if(ledger.stop_reason)break;
    }
  }catch{stop('collection_runtime_failure');process.exitCode=1;await Promise.allSettled(allTasks);}
  finally{
    await Promise.allSettled(allFetches);
    if(active!==0||ledger.in_flight_input_reservation!==0)stop('unfinished_request_accounting');
    token='';save();const receipt=allow.auditSnapshot();atomic(path.join(raw,'guard-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
    fs.writeFileSync(path.join(raw,'collection-summary.json'),JSON.stringify(snapshot(),null,2)+'\n');
    process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onTerminate);
  }
  if(ledger.stop_reason||records.some(row=>row.not_run))process.exitCode=1;
  return snapshot();
}
module.exports={main,localConfiguration};
if(require.main===module)main(...process.argv.slice(2)).catch(()=>{process.stderr.write('live_collection_preflight_failed\n');process.exitCode=1;});
