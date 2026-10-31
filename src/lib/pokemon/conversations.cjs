'use strict';
const family = require('./sourceFamilyAdvisory.cjs');
const commerceHistory=require('./commerceHistory.cjs');
const {comparisonRecords}=require('./comparisonRecords.cjs');
const {routeChatText,releaseSuggestions}=require('./chatTextIntent.cjs');
const {renderModelReply}=require('./modelTurn.cjs');
const {MAX_TIMEOUT_MS:MODEL_CALL_MS}=require('./geminiVertex.cjs');
const {PRIVATE_WORK_MS}=require('./requestBudgets.cjs');
const {admit}=require('./admission.cjs');
const {createCatalogAdapter}=require('./catalogAdapter.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {CollectorCallError}=require('./collectorError.cjs');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const fail=code=>{throw new CollectorCallError(code);};
const copy=v=>structuredClone(v);
const MODEL_CALL_LIMIT=20;
const MODEL_STATUS=new Set(['accepted','unavailable','invalid','budget_exhausted']);
const MODEL_CODES=new Set(['accepted','model_unavailable','invalid_model_proposal','model_budget_exhausted','gemini_timeout','gemini_cancelled']);
const MODEL_EXPLANATIONS=new Set(['current_results','identity_ambiguity','grade_budget_unverified','prices_unavailable','provider_disabled','capability_scope']);
const MODEL_FIELDS=new Set(['language','character','release','number','finish','compound','task']);
function admittedModelRoute(value){
  if(!exact(value,['action','languagePreference','modelMeta'])||![null,'en','ja'].includes(value.languagePreference)||
    !exact(value.modelMeta,['status','code'])||!MODEL_STATUS.has(value.modelMeta.status)||!MODEL_CODES.has(value.modelMeta.code))return false;
  const a=value.action;
  if(!a||typeof a!=='object'||Array.isArray(a))return false;
  const combinations={accepted:['accepted'],unavailable:['model_unavailable','gemini_timeout','gemini_cancelled'],invalid:['invalid_model_proposal'],budget_exhausted:['model_budget_exhausted']};
  if(!combinations[value.modelMeta.status].includes(value.modelMeta.code)||value.modelMeta.status!=='accepted'&&a.type!=='model_clarification')return false;
  if(a.type==='ask')return exact(a,['type','question'])&&typeof a.question==='string'&&!!a.question.trim()&&a.question.length<=2000;
  if(a.type==='reply')return exact(a,['type','text'])&&typeof a.text==='string'&&!!a.text.trim()&&a.text.length<=200;
  if(a.type==='refine')return exact(a,['type','scope'])&&exact(a.scope,['language'])&&['en','ja'].includes(a.scope.language);
  if(a.type==='preferences')return exact(a,['type','preferences'])&&a.preferences&&typeof a.preferences==='object'&&!Array.isArray(a.preferences)&&
    Object.keys(a.preferences).length>0&&Object.keys(a.preferences).every(k=>['grade_company','grade_value','budget_minor','currency'].includes(k))&&
    Object.entries(a.preferences).every(([k,v])=>k==='budget_minor'?Number.isSafeInteger(v)&&v>=1&&v<=1e12:k==='currency'?typeof v==='string'&&/^[A-Z]{3}$/.test(v):typeof v==='string'&&v.length>0&&v.length<=20);
  if(a.type==='recommendation_status'||a.type==='language_clarification')return exact(a,['type']);
  if(a.type==='model_explanation')return exact(a,['type','key'])&&MODEL_EXPLANATIONS.has(a.key);
  return a.type==='model_clarification'&&exact(a,['type','field','reason'])&&MODEL_FIELDS.has(a.field)&&
    ['uncertain','model_unavailable','budget_exhausted'].includes(a.reason);
}
function modelFallback(languagePreference,code='model_unavailable'){
  return {action:{type:'model_clarification',field:'task',reason:code==='model_budget_exhausted'?'budget_exhausted':'model_unavailable'},
    languagePreference:['en','ja'].includes(languagePreference)?languagePreference:null,
    modelMeta:{status:code==='model_budget_exhausted'?'budget_exhausted':code==='invalid_model_proposal'?'invalid':'unavailable',code}};
}
function interpretOnce(interpret,input,{signal,deadline}){
  return new Promise((resolve,reject)=>{
    let done=false;const controller=new AbortController();
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal.removeEventListener('abort',abort);if(error)reject(error);else resolve(value);};
    const abort=()=>{controller.abort();finish(new CollectorCallError('catalog_cancelled'));};
    const end=Math.min(deadline??Infinity,Date.now()+MODEL_CALL_MS),timer=setTimeout(()=>{controller.abort();finish(Object.assign(new Error('gemini_timeout'),{code:'gemini_timeout'}));},Math.max(0,end-Date.now()));
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    Promise.resolve().then(()=>{if(controller.signal.aborted)throw new CollectorCallError('catalog_cancelled');return interpret(input,{signal:controller.signal,deadline:end});}).then(value=>finish(null,value),error=>finish(error));
  });
}
function cardForMessage(message,id){
  const card=message?.cards?.find(c=>c.card_id===id);if(card)return card;
  for(const side of ['left','right'])for(const record of comparisonRecords(message?.comparison,side))if(record.card_id===id)return record;
  return null;
}
function createConversationFileStore({directory}) {
  const root=path.resolve(directory);
  const file=(owner,kind,id)=>{
    if(!/^[a-f0-9]{64}$/.test(owner)||!['chats','bookmarks'].includes(kind)||!uuid(id))fail('invalid_chat_request');
    return path.join(root,owner,kind,id+'.json');
  };
  return {
    async get(owner,kind,id){try{return JSON.parse(await fs.readFile(file(owner,kind,id),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
    async put(owner,kind,id,value){
      const target=file(owner,kind,id),data=JSON.stringify(value);
      if(Buffer.byteLength(data)>2*1024*1024)fail('conversation_storage_limit');
      await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
      const temporary=target+'.'+randomUUID()+'.tmp';
      try{await fs.writeFile(temporary,data,{flag:'wx',mode:0o600});await fs.rename(temporary,target);}finally{await fs.rm(temporary,{force:true});}
    },
    async list(owner,kind){
      if(!/^[a-f0-9]{64}$/.test(owner)||!['chats','bookmarks'].includes(kind))fail('invalid_chat_request');
      let names;try{names=await fs.readdir(path.join(root,owner,kind));}catch(e){if(e.code==='ENOENT')return [];throw e;}
      const records=[];for(const name of names)if(uuid(name.slice(0,-5))&&name.endsWith('.json')){const record=await this.get(owner,kind,name.slice(0,-5));if(record)records.push(record);}return records;
    },
    async delete(owner,kind,id){await fs.rm(file(owner,kind,id),{force:true});},
  };
}
function recommendationReasons(result,cardId) {
  return (result.recommendation?.items.find(i=>i.card_id===cardId)?.reasons||[]).map(r=>
    r.field==='illustrator'?'Recorded illustrator: '+r.value+'.':
    r.field==='dex_id'?'Matches your character preference.':
    r.field==='language_set_coordinate'?'Matches your release preference.':
    r.field==='character_name_affiliation'?'Matches a source-bound character-name affiliation; the source does not assert a Pokédex ID.':'Source-backed catalog preference match.');
}
function assistantReply(workspace,action,now) {
  workspace=workspace||{version:0,result:null};
  const r=workspace.result;let text;
  const prompt=r?.next_step?.prompt||workspace.next_step?.prompt||r?.discovery?.next_question;
  const comparisonNeedsRefresh=action?.type==='preferences'&&!!r?.discovery?.comparison;
  if(['model_explanation','model_clarification'].includes(action?.type))return {id:randomUUID(),role:'assistant',status:'accepted',
    text:renderModelReply(action,workspace),createdAt:now,workspaceVersion:workspace.version,catalogRevision:r?.catalog_revision||null,
    cards:[],reasons:{},comparison:null,selectionAllowed:false,...(action.type==='model_explanation'?{catalogStatusOnly:true}:{}),
    clarificationSuggestions:releaseSuggestions(r)};
  if(action?.type==='language_clarification')return {id:randomUUID(),role:'assistant',status:'accepted',
    text:'Which language should I use? Please choose English or Japanese, or restate the collection question with the languages you want.',
    createdAt:now,workspaceVersion:workspace.version,catalogRevision:r?.catalog_revision||null,
    cards:[],reasons:{},comparison:null,selectionAllowed:false};
  if(action?.type==='recommendation_status'){
    const count=r?.candidate_cards?.length||0;
    text=count?`I’ve shown ${count} catalog option${count===1?'':'s'} for this request. Review the cards above, or ask for a different card.`:
      'I haven’t recommended any cards for this request yet. '+(prompt||'Which character, illustrator or printed set would you like to explore?');
    return {id:randomUUID(),role:'assistant',status:'accepted',text,createdAt:now,workspaceVersion:workspace.version,
      catalogRevision:r?.catalog_revision||null,cards:[],reasons:{},comparison:null,selectionAllowed:false,catalogStatusOnly:true,
      clarificationSuggestions:releaseSuggestions(r)};
  }
  if(!r)text=prompt||'Start a collection question to continue; a catalog target needs a fresh confirmation.';
  else if(r?.status==='catalog_target_selected')text='You’ve set '+r.selected_catalog_target.name+' as your current catalog target. Physical copy, price and availability remain unverified.';
  else if(comparisonNeedsRefresh)text='I’ve updated your preferences. Your saved cards stay in place. '+(r?.next_step?.prompt||'Refresh the comparison before inspecting a side and setting a target again.');
  else if(r?.discovery?.comparison)text='Here are the recorded differences between these two cards. Open Details to inspect an exact record before deciding.';
  else if(r?.selection_blockers?.length)text=prompt||'Clarify the requested catalog scope before choosing a target.';
  else if(action?.type==='preferences')text='I’ve updated your preferences. Your saved cards stay in place. Review these options before setting a target again.';
  else if(r?.candidate_cards?.length)text='Here '+(r.candidate_cards.length===1?'is one source-backed option':'are '+r.candidate_cards.length+' source-backed options')+' for your collection. Save any you want to revisit, or tell me what to change.';
  else text=prompt||'Which character, illustrator or printed set would you like to explore?';
  if(r?.discovery?.task==='exact_coordinates'&&r?.discovery?.status==='no_match')
    text='No catalog record matches that name, release and number together. Check the card name and printed number, or ask to browse that release without the number.';
  const messages=[text];
  if(r?.constraint_acknowledgement?.explanation&&['ask','preferences'].includes(action?.type)&&Object.keys(r.preferences||{}).some(k=>k!=='collecting'))messages.push(r.constraint_acknowledgement.explanation);
  for(const p of r?.discovery?.preference_match_summary||[])if(!p.matched_qualified_records)messages.push(p.explanation);
  if(r?.recommendation?.unapplied_preferences?.length)messages.push('Your style notes are retained, but the sources do not establish those labels for ranking.');
  return {id:randomUUID(),role:'assistant',status:'accepted',text:messages.join('\n\n'),createdAt:now,
    workspaceVersion:workspace.version,catalogRevision:r?.catalog_revision||null,cards:copy(r?.candidate_cards||[]),
    reasons:Object.fromEntries((r?.candidate_cards||[]).map(c=>[c.card_id,recommendationReasons(r,c.card_id)])),
    comparison:copy(r?.discovery?.comparison||null),comparisonNeedsRefresh,coverage:copy(r?.discovery?.coverage||null),
    blockers:copy(r?.card_selection_blockers||{}),selectionAllowed:r?.selection_allowed===true,
    clarificationSuggestions:releaseSuggestions(r)};
}
function actionText(action) {
  if(action.type==='reply')return action.text;
  if(action.type==='ask')return action.question;
  if(action.type==='select')return 'Set '+action.card_id+' as my current catalog target.';
  if(action.type==='compare')return 'Compare '+action.left_card_id+' and '+action.right_card_id+'.';
  if(action.type==='choose_comparison')return 'View details for '+action.card_id+'.';
  if(action.type==='feedback')return (action.reaction==='like'?'I like this option: ':action.reaction==='dismiss'?'Dismiss this option: ':'Clear my feedback for ')+action.card_id+'.';
  if(action.type==='preferences')return 'Update my collection preferences.';
  if(action.type==='refine')return 'Use this release: '+action.scope?.set_code+'.';
  if(action.type==='page')return 'Show another page of options.';
  if(action.type==='clear_target')return 'Clear my current target.';
  if(action.type==='inventory')return 'Apply the catalog records I say I own.';
  if(action.type==='resolve_owned')return 'Confirm the catalog identity of my supplied record.';
  return 'Update this collection conversation.';
}
const FAILURE_TEXT={catalog_cancelled:'The turn was interrupted. Your conversation and saved cards are still here. Send your collection question again, then choose a target separately.',
  catalog_stored_goal_requires_restart:'This chat contains an older search that I cannot safely replay. Start a new chat and send a new card search. Your saved cards remain available.',
  catalog_timeout:'This turn timed out. Your saved cards are unchanged. Retry your question and review the current evidence before setting a target.',
  journey_turn_limit:'This chat reached the catalog turn limit. Start a new chat to continue; your saved cards remain available.',
  catalog_rejected_action:'That choice needs current scope or evidence. Check the latest prompt before setting a target.',
  catalog_snapshot_changed:'The catalog snapshot changed. Start a new chat and review the card again before confirming a target.'};

function createConversationService({workspace,authenticate,store,now=Date.now,retentionMs=86400000,localFixtureGuard=false,admitPresentation,interpretTurn}) {
  if(interpretTurn!=null&&typeof interpretTurn!=='function')throw Error('invalid_model_configuration');
  const catalog=createCatalogAdapter({workspace,authenticate,now});
  const locks=new Map();
  async function owner(context){let principal;try{principal=await authenticate(context);}catch{fail('collector_caller_denied');}if(!principal||typeof principal.id!=='string'||!principal.id.trim()||principal.id.length>200)fail('collector_caller_denied');return createHash('sha256').update(principal.id).digest('hex');}
  async function read(user,id,admit=true){if(!uuid(id))fail('chat_not_found');const doc=await store.get(user,'chats',id);if(!doc||doc.expiresAt<=now())fail('chat_not_found');if(admit)await family.admitStoredPresentation(doc,admitPresentation);return doc;}
  function lock(user,id,cancellable=false){if(locks.has(user))fail('logical_turn_in_progress');let finish;const settled=new Promise(r=>{finish=r;});const value={id,cancellable,controller:new AbortController(),finish,settled};locks.set(user,value);return value;}
  function release(user,value){if(locks.get(user)===value)locks.delete(user);value.finish();}
  function view(doc,current,busy=false){
    current=copy(current);
    if(current&&(busy||doc.pending)){current.result=null;current.saved_decision=null;current.needs_reconfirmation=true;}
    else if(current&&doc.requiresReconfirmation){current.saved_decision=null;current.needs_reconfirmation=true;}
    if(current&&doc.languageClarificationPending){current.saved_decision=null;current.needs_reconfirmation=true;}
    if(current&&doc.modelClarificationPending){current.saved_decision=null;current.needs_reconfirmation=true;}
    return {id:doc.id,version:doc.version,title:doc.title,createdAt:doc.createdAt,updatedAt:doc.updatedAt,expiresAt:doc.expiresAt,
      messages:commerceHistory.publicMessages(copy(doc.messages)),busy,workspace:current,requiresRestart:!busy&&!current?.result&&!!doc.workspaceId,
      languageClarificationPending:doc.languageClarificationPending===true,
      modelClarificationPending:doc.modelClarificationPending===true,
      target:!busy&&!doc.pending&&!doc.requiresReconfirmation&&!doc.languageClarificationPending&&!doc.modelClarificationPending?copy(current?.saved_decision||null):null};
  }
  async function create(context){
    const user=await owner(context),held=lock(user,null);
    try{
      const records=await store.list(user,'chats');let count=0;
      for(const r of records){if(r.expiresAt<=now())await store.delete(user,'chats',r.id);else count++;}
      if(count>=50)fail('workspace_retention_limit');
      const time=now(),doc={id:randomUUID(),version:0,title:'New chat',createdAt:time,updatedAt:time,expiresAt:time+retentionMs,messages:[],workspaceId:null,pending:null,requiresReconfirmation:true};
      await store.put(user,'chats',doc.id,doc);return view(await read(user,doc.id),null);
    }finally{release(user,held);}
  }
  async function operate(context,payload,{signal,deadline}={},textMode=false,serverAction=false){
    const startedAt=Date.now();
    const user=await owner(context);
    if(!exact(payload,textMode?['id','version','text']:['id','version','action'])||!Number.isInteger(payload.version))fail('invalid_chat_request');
    if(textMode&&(typeof payload.text!=='string'||!payload.text.trim()||payload.text.length>2000))fail('invalid_chat_request');
    if(!textMode&&(!payload.action||!(serverAction?['inspect_record','compare_records']:['ask','reply','select','compare','choose_comparison','preferences','refine','page','feedback','clear_target','inventory','resolve_owned']).includes(payload.action.type)))fail('invalid_chat_request');
    if(!textMode&&payload.action.type==='reply'&&(typeof payload.action.text!=='string'||!payload.action.text.trim()||payload.action.text.length>2000))fail('invalid_chat_request');
    if(!textMode&&payload.action.type==='ask'&&(typeof payload.action.question!=='string'||!payload.action.question.trim()||payload.action.question.length>2000))fail('invalid_chat_request');
    const held=lock(user,payload.id,true),abort=()=>held.controller.abort(),operation=family.currentOperation();
    const signals=[...new Set([signal,operation?.signal].filter(Boolean))];
    for(const s of signals){s.addEventListener('abort',abort,{once:true});if(s.aborted)abort();}
    const end=Math.min(startedAt+PRIVATE_WORK_MS,...[deadline,operation?.deadline].filter(Number.isFinite));
    const timer=setTimeout(abort,Math.max(0,end-Date.now()));
    const active=()=>{if(Date.now()>=end)fail('catalog_timeout');if(held.controller.signal.aborted)fail('catalog_cancelled');};
    let doc,current,pendingOwned=false;
    try {
      active();doc=await read(user,payload.id);if(doc.pending||doc.commercePending)fail('logical_turn_in_progress');if(doc.version!==payload.version)fail('chat_version_conflict');
      current=doc.workspaceId?await workspace.get(context,doc.workspaceId):null;
      active();const sourceDoc=copy(doc),routingState={languagePreference:doc.languagePreference,languageClarificationPending:doc.languageClarificationPending===true};
      const modelEnabled=textMode&&typeof interpretTurn==='function',text=textMode?payload.text.trim():actionText(payload.action);
      let routed=modelEnabled?null:textMode?routeChatText(text,current,routingState):null;
      let action=modelEnabled?null:textMode?routed.action:copy(payload.action),modelRequestId;
      if(modelEnabled){
        const count=doc.modelCalls===undefined?0:Number.isSafeInteger(doc.modelCalls)&&doc.modelCalls>=0&&doc.modelCalls<=MODEL_CALL_LIMIT?doc.modelCalls:MODEL_CALL_LIMIT;
        modelRequestId=randomUUID();
        const time=now();doc={...doc,version:doc.version+1,updatedAt:time,title:doc.messages.length?doc.title:text.slice(0,100),
          pending:true,requiresReconfirmation:true,commerceAnchor:null,modelCalls:count<MODEL_CALL_LIMIT?count+1:count,
          modelPending:{requestId:modelRequestId,stateVersion:sourceDoc.version,workspaceVersion:current?.version??null,startedAt:time},
          messages:[...doc.messages,{id:randomUUID(),role:'user',status:'submitted',text,createdAt:time}]};
        // Reserve the call durably before acquiring credentials or contacting a model.
        pendingOwned=true;await store.put(user,'chats',doc.id,doc);active();
        if(count>=MODEL_CALL_LIMIT)routed=modelFallback(routingState.languagePreference,'model_budget_exhausted');
        else{
          try{routed=await interpretOnce(interpretTurn,{text,doc:sourceDoc,current:copy(current)},{signal:held.controller.signal,deadline:end});}
          catch(error){active();if(error?.code==='catalog_cancelled')throw error;routed=modelFallback(routingState.languagePreference,error?.code==='gemini_timeout'?'gemini_timeout':'model_unavailable');}
          active();if(!admittedModelRoute(routed))routed=modelFallback(routingState.languagePreference,'invalid_model_proposal');
        }
        action=copy(routed.action);
      }
      // Every candidate, including a reply reroute and server-authored action,
      // crosses the same constructor. The bound version is the durable turn
      // reservation, not a model-supplied version or the caller's next guess.
      const binding={owner:user,chatId:sourceDoc.id,stateVersion:sourceDoc.version+1,
        workspaceId:current?.id??null,workspaceVersion:current?.version??null,deadline:end};
      const plan=admit({candidate:{action},text:textMode?text:action.type==='ask'?action.question:action.type==='reply'?action.text:'',
        ingress:serverAction?'server':textMode?'text':'typed',binding,current,doc:sourceDoc,now});
      action=plan.action;
      if(routed)routed={...routed,languagePreference:plan.languagePreference};
      const languageChoice=!plan.hold&&['en','ja'].includes(plan.languagePreference)&&
        (action.type==='refine'&&Object.hasOwn(action.scope,'language')||action.type==='ask'&&sourceDoc.languageClarificationPending);
      const statusOnly=['recommendation_status','model_explanation'].includes(action.type),localOnly=statusOnly||['language_clarification','model_clarification'].includes(action.type);
      if(action.type==='reply'&&action.text.length>200)fail('chat_reply_too_long');
      const languagePending=action.type==='language_clarification'||action.type==='model_clarification'&&action.field==='language';
      if(modelEnabled){
        doc={...doc,languagePreference:routed.languagePreference,requiresReconfirmation:statusOnly?sourceDoc.requiresReconfirmation:true,
          commerceAnchor:statusOnly?sourceDoc.commerceAnchor??null:null,...(languagePending?{languageClarificationPending:true}:{}),
          ...(action.type==='model_clarification'?{modelClarificationPending:true,modelClarificationField:action.field}:{}),
          modelLast:{requestId:modelRequestId,...routed.modelMeta}};
      }else{
        const time=now();doc={...doc,languagePreference:plan.languagePreference,...(languagePending?{languageClarificationPending:true}:{}),
          ...(action.type==='model_clarification'?{modelClarificationPending:true,modelClarificationField:action.field}:{}),
          version:doc.version+1,updatedAt:time,title:doc.messages.length?doc.title:text.slice(0,100),requiresReconfirmation:statusOnly?doc.requiresReconfirmation:true,pending:true,...(!statusOnly?{commerceAnchor:null}:{}),
          messages:[...doc.messages,{id:randomUUID(),role:'user',status:'submitted',text,createdAt:time}]};
        // The pending marker survives a process interruption and never confers target authority.
        pendingOwned=true;await store.put(user,'chats',doc.id,doc);
      }
      active();
      if(localOnly){
        // Local interpretation/status/explanation cannot create selection authority or replay a search.
      }else{
        current=await catalog.execute(context,plan,{binding,signal:held.controller.signal,deadline:end});doc.workspaceId=current.id;
      }
      if(action.type==='select')current=await catalog.save(context,plan,current,{binding,signal:held.controller.signal,deadline:end});
      if(current?.id)current=await workspace.get(context,current.id);
      active();
      const acceptedLanguage=current?.result?.scope_filters?.language;
      if(languageChoice)doc.languageClarificationPending=false;
      if(!localOnly&&['ask','refine','preferences'].includes(action.type)){doc.modelClarificationPending=false;doc.modelClarificationField=null;}
      if(action.type==='refine'&&Object.hasOwn(action.scope,'language'))doc.languagePreference=action.scope.language;
      else if(['en','ja'].includes(acceptedLanguage))doc.languagePreference=acceptedLanguage;
      doc={...doc,version:doc.version+1,updatedAt:now(),pending:null,...(modelEnabled?{modelPending:null}:{}),
        ...(!localOnly?{admissionFailure:false}:{}),
        requiresReconfirmation:statusOnly?sourceDoc.requiresReconfirmation:action.type!=='select'||current?.needs_reconfirmation,
        messages:[...doc.messages,assistantReply(current,action,now())]};
      await store.put(user,'chats',doc.id,doc);return view(await read(user,doc.id),current);
    } catch(error) {
      if(pendingOwned&&doc?.pending){
        doc={...doc,version:doc.version+1,updatedAt:now(),pending:null,...(doc.modelPending?{modelPending:null}:{}),requiresReconfirmation:true,commerceAnchor:null,
          ...(['catalog_admission_echo_mismatch','catalog_stored_goal_requires_restart'].includes(error.code)?{admissionFailure:true,modelClarificationPending:true,modelClarificationField:'task'}:{}),
          messages:[...doc.messages,{id:randomUUID(),role:'assistant',status:'failed',text:FAILURE_TEXT[error.code]||'This turn could not finish. Your saved cards remain available. Review the current conversation before setting a target.',createdAt:now(),cards:[],reasons:{},comparison:null}]};
        await store.put(user,'chats',doc.id,doc);
      }
      throw error;
    }finally{clearTimeout(timer);for(const s of signals)s.removeEventListener('abort',abort);release(user,held);}
  }
  async function get(context,id){
    const user=await owner(context);
    if(locks.has(user)){const doc=await read(user,id),current=doc.workspaceId?await workspace.get(context,doc.workspaceId):null;return view(doc,current,true);}
    const held=lock(user,id);
    try{
      let doc=await read(user,id);const recovered=commerceHistory.expire(doc,now());if(recovered!==doc){await store.put(user,'chats',id,recovered);doc=recovered;}
      if(doc.pending){doc={...doc,version:doc.version+1,pending:null,pendingTextNotice:null,...(doc.modelPending?{modelPending:null}:{}),requiresReconfirmation:true,commerceAnchor:null,messages:[...doc.messages,{id:randomUUID(),role:'assistant',status:'failed',text:(doc.pendingTextNotice?doc.pendingTextNotice+'\n\n':'')+FAILURE_TEXT.catalog_cancelled,createdAt:now(),cards:[],reasons:{},comparison:null}]};await store.put(user,'chats',id,doc);doc=await read(user,id);}
      const current=doc.workspaceId?await workspace.get(context,doc.workspaceId):null;return view(doc,current,!!doc.commercePending);
    }finally{release(user,held);}
  }
  async function bookmarks(context){const user=await owner(context);const rows=(await store.list(user,'bookmarks')).filter(b=>b.expiresAt>now()).sort((a,b)=>b.savedAt-a.savedAt);for(const row of rows)await family.admitStoredPresentation(row,admitPresentation);return rows;}
  async function bookmark(context,payload){
    const user=await owner(context);if(!exact(payload,['conversation_id','message_id','card_id'])||!uuid(payload.message_id)||typeof payload.card_id!=='string')fail('invalid_chat_request');
    const held=lock(user,payload.conversation_id);
    try{
      const doc=await read(user,payload.conversation_id),message=doc.messages.find(m=>m.id===payload.message_id&&m.role==='assistant'&&m.status==='accepted');
      const card=cardForMessage(message,payload.card_id);if(!card)fail('invalid_chat_request');
      const records=await bookmarks(context),existing=records.find(b=>b.card.card_id===card.card_id);if(existing)return existing;
      if(records.length>=100)fail('bookmark_limit');
      const savedAt=now(),record={id:randomUUID(),kind:'catalog_bookmark',card:copy(card),catalogRevision:message.catalogRevision,conversationId:doc.id,messageId:message.id,savedAt,expiresAt:savedAt+retentionMs,ownershipVerified:false,transactionReady:false};
      await store.put(user,'bookmarks',record.id,record);return await readBookmark(context,record.id);
    }finally{release(user,held);}
  }
  async function readBookmark(context,id,admit=true){const user=await owner(context);if(!uuid(id))fail('bookmark_not_found');const record=await store.get(user,'bookmarks',id);if(!record||record.expiresAt<=now())fail('bookmark_not_found');if(admit)await family.admitStoredPresentation(record,admitPresentation);return record;}
  return {
    async beginCommerce(context,payload){
      if(!exact(payload,['id','version','request_id','operation','request']))fail('invalid_commerce_request');
      const user=await owner(context),held=lock(user,payload.id);
      try{
        const doc=await read(user,payload.id,false),current=doc.workspaceId?await workspace.get(context,doc.workspaceId):null;
        const binding={owner:user,chatId:doc.id,stateVersion:doc.version,workspaceId:current?.id??null,workspaceVersion:current?.version??null,deadline:Date.now()+PRIVATE_WORK_MS};
        const plan=admit({candidate:{operation:payload.operation,request:payload.request},ingress:'commerce',binding,current,doc,now});
        const next=await catalog.beginCommerce(context,plan,{binding,payload,doc,begin:commerceHistory.begin,now:now()});
        await store.put(user,'chats',doc.id,next);return {event_id:next.commercePending.id,version:next.version};
      }finally{release(user,held);}
    },
    async finishCommerce(context,payload){
      if(!payload||!exact(payload,['id','event_id','operation','request',...(Object.hasOwn(payload,'error')?['error']:['response'])]))fail('invalid_commerce_request');
      const user=await owner(context),held=lock(user,payload.id);
      try{const doc=await read(user,payload.id,false);let next,accepted=true;try{next=commerceHistory.finish(doc,payload,now());}catch(error){if(error.code!=='commerce_reservation_expired')throw error;next=commerceHistory.expire(doc,now());accepted=false;}await store.put(user,'chats',doc.id,next);return {event_id:payload.event_id,version:next.version,accepted};}finally{release(user,held);}
    },
    async withLocalFixture(context,payload,callback){
      if(!localFixtureGuard||!exact(payload,['id'])||typeof callback!=='function')fail('invalid_chat_request');
      const user=await owner(context),held=lock(user,payload.id);
      try{
        const doc=await read(user,payload.id);if(doc.pending)fail('logical_turn_in_progress');
        const current=doc.workspaceId?await workspace.get(context,doc.workspaceId):null;
        return await callback(view(doc,current),held.controller.signal);
      }finally{release(user,held);}
    },
    async create(context,payload){if(!exact(payload,[]))fail('invalid_chat_request');return create(context);},
    async send(context,payload,options){return operate(context,payload,options,true);},
    async action(context,payload,options){return operate(context,payload,options,false);},
    async get(context,payload){if(!exact(payload,['id']))fail('invalid_chat_request');return get(context,payload.id);},
    async list(context,payload){if(!exact(payload,[]))fail('invalid_chat_request');const user=await owner(context);return (await store.list(user,'chats')).filter(d=>d.expiresAt>now()&&d.messages.length).sort((a,b)=>b.updatedAt-a.updatedAt).map(d=>({id:d.id,title:d.title,updatedAt:d.updatedAt,expiresAt:d.expiresAt}));},
    async cancel(context,payload){
      if(!exact(payload,['id']))fail('invalid_chat_request');const user=await owner(context),active=locks.get(user);
      if(active){await read(user,payload.id,false);if(active.id===payload.id&&active.cancellable){active.controller.abort();return {cancellation_requested:true};}return {cancellation_requested:false};}
      const held=lock(user,payload.id);
      try{const doc=await read(user,payload.id,false);if(doc.commercePending){await store.put(user,'chats',doc.id,commerceHistory.cancel(doc,now()));return {cancellation_requested:true};}return {cancellation_requested:false};}finally{release(user,held);}
    },
    async delete(context,payload){if(!exact(payload,['id']))fail('invalid_chat_request');const user=await owner(context);const active=locks.get(user);if(active?.id===payload.id){active.controller.abort();await active.settled;}const held=lock(user,payload.id);try{const doc=await read(user,payload.id,false);if(doc.workspaceId)await workspace.delete(context,doc.workspaceId);await store.delete(user,'chats',doc.id);return {deleted:true};}finally{release(user,held);}},
    async bookmarkList(context,payload){if(!exact(payload,[]))fail('invalid_chat_request');return bookmarks(context);},
    async bookmarkAdd(context,payload){return bookmark(context,payload);},
    async bookmarkRemove(context,payload){if(!exact(payload,['id']))fail('invalid_chat_request');const user=await owner(context),held=lock(user,null);try{await readBookmark(context,payload.id,false);await store.delete(user,'bookmarks',payload.id);return {removed:true};}finally{release(user,held);}},
    async reviewBookmark(context,payload,options){if(!exact(payload,['id']))fail('invalid_chat_request');const b=await readBookmark(context,payload.id),doc=await create(context);return operate(context,{id:doc.id,version:doc.version,action:{type:'inspect_record',card_id:b.card.card_id}},options,false,true);},
    async reviewCard(context,payload,options){if(!exact(payload,['conversation_id','message_id','card_id']))fail('invalid_chat_request');const user=await owner(context),source=await read(user,payload.conversation_id),message=source.messages.find(m=>m.id===payload.message_id&&m.status==='accepted');const card=cardForMessage(message,payload.card_id);if(!card)fail('invalid_chat_request');const doc=await create(context);return operate(context,{id:doc.id,version:doc.version,action:{type:'inspect_record',card_id:card.card_id}},options,false,true);},
    async compareBookmarks(context,payload,options){if(!exact(payload,['left_id','right_id'])||payload.left_id===payload.right_id)fail('invalid_chat_request');const left=await readBookmark(context,payload.left_id),right=await readBookmark(context,payload.right_id),doc=await create(context);return operate(context,{id:doc.id,version:doc.version,action:{type:'compare_records',left_card_id:left.card.card_id,right_card_id:right.card.card_id}},options,false,true);},
  };
}
module.exports={createConversationFileStore,createConversationService};
