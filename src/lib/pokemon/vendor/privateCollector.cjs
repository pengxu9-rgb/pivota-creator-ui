'use strict';
const family = require('../sourceFamilyAdvisory.cjs');
const {workspaceFeedback}=require('../workspaceFeedback.cjs');
// Local reference contract. Actual Pivota middleware/owner registration is open.
const {randomUUID, createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {CollectorCallError} = require('../collectorError.cjs');
const copy = value => structuredClone(value);
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === keys.sort().join(',');
const fail = code => {throw new CollectorCallError(code);};
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
const namespace = principal => createHash('sha256').update(principal).digest('hex');

function createMemoryStore() {
  const records = new Map();
  return {
    async get(user, id) {return copy(records.get(user + '/' + id) || null);},
    async put(user, id, value) {records.set(user + '/' + id, copy(value));},
    async delete(user, id) {records.delete(user + '/' + id);},
    async list(user) {return [...records.entries()].filter(([key]) => key.startsWith(user + '/')).map(([, value]) => copy(value));},
  };
}

// Server-only storage. No context, credentials or tokens are serialized. The
// caller must protect the directory and run one writer (or provide atomic CAS).
function createLocalDecisionStore({directory}) {
  const root = path.resolve(directory);
  const file = (user, id) => {
    if (!/^[a-f0-9]{64}$/.test(user) || !validId(id)) fail('invalid_storage_key');
    return path.join(root, user, id + '.json');
  };
  return {
    async get(user, id) {try {return JSON.parse(await fs.readFile(file(user,id),'utf8'));} catch(e) {if(e.code==='ENOENT') return null; throw e;}},
    async put(user, id, value) {
      const target=file(user,id);const bytes=JSON.stringify(value);
      if (Buffer.byteLength(bytes)>1024*1024) fail('workspace_storage_limit');
      await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
      const temporary=target+'.'+randomUUID()+'.tmp';
      try {await fs.writeFile(temporary,bytes,{mode:0o600,flag:'wx'});await fs.rename(temporary,target);}
      finally {await fs.rm(temporary,{force:true});}
    },
    async delete(user,id) {await fs.rm(file(user,id),{force:true});},
    async list(user) {
      if (!/^[a-f0-9]{64}$/.test(user)) fail('invalid_storage_key');
      let names;try {names=await fs.readdir(path.join(root,user));}catch(e){if(e.code==='ENOENT')return [];throw e;}
      const values=[];for(const name of names) if(/^[a-f0-9-]{36}\.json$/.test(name)) values.push(await this.get(user,name.slice(0,-5)));
      return values.filter(Boolean);
    },
  };
}

function createPrivateCollectorWorkspace({client, authenticate, store=createMemoryStore(), now=Date.now, retentionMs=86400000, admitPresentation}={}) {
  if (!client || typeof client.advance!=='function' || typeof authenticate!=='function'
      || !Number.isSafeInteger(retentionMs) || retentionMs<60000 || retentionMs>30*86400000) fail('private_workspace_not_configured');
  const locks=new Map();
  function acquire(user,id,cancellable=true) {
    if(locks.has(user))fail('logical_turn_in_progress');
    let finish;const settled=new Promise(resolve=>{finish=resolve;});
    const lock={id,controller:new AbortController(),settled,finish,phase:'working',cancellable};
    locks.set(user,lock);return lock;
  }
  function release(user,lock){if(locks.get(user)===lock)locks.delete(user);lock.finish();}
  function active(lock){if(lock.controller.signal.aborted)fail('catalog_cancelled');}
  async function owner(context) {
    let principal;try {principal=await authenticate(context);}catch{fail('collector_caller_denied');}
    if (!principal || typeof principal.id!=='string' || !principal.id.trim() || principal.id.length>200) fail('collector_caller_denied');
    return namespace(principal.id);
  }
  async function read(user,id,admit=true) {
    if(!validId(id))fail('workspace_not_found');
    const record=await store.get(user,id);
    if(!record)fail('workspace_not_found');
    if(record.expiresAt<=now())fail('workspace_expired');
    if(admit)await family.admitStoredPresentation(record,admitPresentation);
    return record;
  }
  function view(user,record,ownLock=null) {
    const busy=locks.has(user)&&locks.get(user)!==ownLock;
    return {id:record.id,version:record.version,expiresAt:record.expiresAt,busy,
      result:busy?null:copy(record.result),collecting_feedback:busy?{}:workspaceFeedback(record.session,record.result),next_step:copy(record.next_step),
      saved_decision:busy?null:copy(record.savedDecision),needs_reconfirmation:busy||record.needsReconfirmation,
      visibility:'private_catalog_only',transaction_ready:false};
  }
  function withdraw(record) {
    // A canceled transcript can contain the selected target even after the
    // visible result is withdrawn. Drop replay authority as well as its view.
    return {...copy(record),version:record.version+1,session:null,result:null,savedDecision:null,needsReconfirmation:true,confirmationInvalidatedByFailure:true,
      next_step:{field:'restart_and_reconfirm',prompt:'The turn was interrupted. Restore this workspace, start your question again and independently reconfirm the catalog target.'}};
  }
  // A local commit becomes authoritative only after put has settled and the
  // cancellation check passes. Reads expose no authority while the lock is
  // held. Cancellation during put is compensated under that same lock before
  // acknowledgement. Multi-process storage still requires transactional CAS.
  async function commit(user,lock,record) {
    active(lock);lock.phase='writing';
    await store.put(user,record.id,record);
    if(lock.controller.signal.aborted){
      await store.put(user,record.id,withdraw(record));lock.phase='withdrawn';
      fail('catalog_cancelled');
    }
    lock.phase='committed';return record;
  }
  function invocation(token,user,id,version,phase='read',consume=false) {
    return require('../catalogAdapter.cjs').validateInvocation(token,api,
      {owner:user,workspaceId:id,workspaceVersion:version,phase},{consume});
  }
  async function operate(user,lock,record,action,signal,admission,scope) {
    const acceptedRecord=copy(record);
    if(signal!==undefined && !(signal instanceof AbortSignal))fail('invalid_cancellation_signal');
    const abort=()=>lock.controller.abort();signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
    try {
      active(lock);
      const confirmationWasInvalid=record.confirmationInvalidatedByFailure===true||
        (record.needsReconfirmation&&record.result?.status==='catalog_target_selected');
      record={...record,savedDecision:null,needsReconfirmation:true};
      await store.put(user,record.id,record);active(lock);
      const call=await client.advance({session:record.session,action,limit:record.limit,signal:lock.controller.signal});
      active(lock);
      // The legacy parser can reinterpret text. Reject its interpretation while
      // the result is still tentative, before any persisted replay or view can
      // acquire the new candidate/selection authority.
      if(call.status==='catalog_changed'&&call.result===null&&call.session===null)
        require('../catalogAdapter.cjs').validateInvocation(admission,api,scope);
      else require('../catalogAdapter.cjs').validateNativePublication(admission,api,scope,call.result);
      active(lock);
      const next={...record,version:record.version+1,session:call.session,result:call.result,next_step:call.next_step,
        // A retained selected transcript does not constitute a fresh choice
        // after any failed logical turn. Only explicit select clears the latch.
        needsReconfirmation:call.status!=='accepted'||call.result?.status!=='catalog_target_selected'||
          (confirmationWasInvalid&&action?.type!=='select'),
        confirmationInvalidatedByFailure:confirmationWasInvalid&&action?.type!=='select'};
      return await commit(user,lock,next);
    } catch(error) {
      if(error.code==='catalog_cancelled'&&lock.phase!=='withdrawn'){
        await store.put(user,record.id,withdraw(record));lock.phase='withdrawn';
      }else if(lock.phase!=='withdrawn'&&lock.phase!=='committed'){
        // A failed commit must not make its tentative replay authoritative.
        // Restore the last accepted state and invalidate target confirmation.
        await store.put(user,acceptedRecord.id,{...acceptedRecord,savedDecision:null,needsReconfirmation:true,confirmationInvalidatedByFailure:true});
      }
      throw error;
    } finally {signal?.removeEventListener('abort',abort);}
  }
  const api={
    async start(context,payload,{signal,admission}={}) {
      const user=await owner(context);
      const plan=invocation(admission,user,null,null,'read',true);
      if(!exact(payload,['question','limit'])||typeof payload.question!=='string'||!payload.question.trim()||payload.question.length>2000||!Number.isInteger(payload.limit)||payload.limit<1||payload.limit>50)fail('invalid_private_workspace_request');
      if(plan.action?.type!=='ask'||payload.question!==plan.action.question)fail('catalog_admission_scope_mismatch');
      const record={id:randomUUID(),version:0,expiresAt:now()+retentionMs,session:null,result:null,next_step:null,savedDecision:null,needsReconfirmation:true,limit:payload.limit};
      const lock=acquire(user,record.id);
      try {
        const records=await store.list(user);let retained=0;
        for(const old of records){if(old.expiresAt<=now())await store.delete(user,old.id);else retained++;}
        if(retained>=50)fail('workspace_retention_limit');active(lock);
        return view(user,await operate(user,lock,record,{type:'ask',question:payload.question},signal,admission,
          {owner:user,workspaceId:null,workspaceVersion:null}),lock);
      } catch(error){await store.delete(user,record.id);throw error;}
      finally {release(user,lock);}
    },
    async advance(context,payload,{signal,admission}={}) {
      const user=await owner(context);
      if(!exact(payload,['id','version','action']))fail('invalid_private_workspace_request');
      const plan=invocation(admission,user,payload.id,payload.version,'read',true);
      if(JSON.stringify(payload.action)!==JSON.stringify(plan.action))fail('catalog_admission_scope_mismatch');
      // Lock precedes every authoritative read and version check.
      const lock=acquire(user,payload.id);
      let record;
      try {
        record=await read(user,payload.id);active(lock);
        if(payload.version!==record.version)fail('workspace_version_conflict');
        if(record.session===null&&payload.action?.type!=='ask')fail('workspace_restart_required');
        // RULE:stored_private_replay_admission
        // get() deliberately hides session.turns. Re-admit every stored ask on
        // the authoritative record under this lock, before operate can write
        // or the client can replay even an earlier, superseded goal.
        if(!require('../admission.cjs').storedGoalsAccepted(record))fail('catalog_stored_goal_requires_restart');
        return view(user,await operate(user,lock,record,payload.action,signal,admission,
          {owner:user,workspaceId:record.id,workspaceVersion:record.version}),lock);
      } catch(error) {
        if(record&&error.code==='catalog_cancelled'&&lock.phase!=='withdrawn'){
          await store.put(user,record.id,withdraw(record));lock.phase='withdrawn';
        }
        throw error;
      } finally {release(user,lock);}
    },
    async get(context,id) {
      const user=await owner(context);
      if(locks.has(user))return {...view(user,await read(user,id)),busy:true,result:null,saved_decision:null,needs_reconfirmation:true};
      const lock=acquire(user,id,false);
      try{return view(user,await read(user,id),lock);}finally{release(user,lock);}
    },
    async list(context) {
      const user=await owner(context);
      if(locks.has(user)){
        const records=await store.list(user);
        return records.filter(r=>r.expiresAt>now()).map(r=>({...view(user,r),busy:true,result:null,saved_decision:null,needs_reconfirmation:true}));
      }
      const lock=acquire(user,null,false);
      try {const records=(await store.list(user)).filter(r=>r.expiresAt>now());for(const record of records)await family.admitStoredPresentation(record,admitPresentation);return records.map(r=>view(user,r,lock));}
      finally {release(user,lock);}
    },
    async save(context,payload,{signal,admission}={}) {
      const user=await owner(context);if(!exact(payload,['id','version']))fail('invalid_private_workspace_request');
      const plan=invocation(admission,user,payload.id,payload.version,'save',true);
      if(plan.action?.type!=='select')fail('catalog_admission_scope_mismatch');
      if(signal!==undefined&&!(signal instanceof AbortSignal))fail('invalid_cancellation_signal');
      const lock=acquire(user,payload.id);
      const abort=()=>lock.controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      let record;
      try {
        record=await read(user,payload.id);active(lock);
        if(payload.version!==record.version)fail('workspace_version_conflict');
        require('../catalogAdapter.cjs').validateNativePublication(admission,api,
          {owner:user,workspaceId:record.id,workspaceVersion:record.version,phase:'save'},record.result);
        const intent=record.result?.target_intent;
        if(record.needsReconfirmation||record.result?.status!=='catalog_target_selected'||!intent
          ||intent.transaction_ready!==false||intent.physical_printing_verified!==false||intent.public_display_allowed!==false||intent.automatic_offer_join_allowed!==false)fail('catalog_confirmation_required');
        record.savedDecision={card_id:intent.card_id,catalog_revision:record.result.catalog_revision,
          catalog_target:copy(record.result.selected_catalog_target),preferences:copy(record.result.preferences),
          evidence:copy(intent),saved_at:now(),expires_at:record.expiresAt,transaction_ready:false};
        record.version++;return view(user,await commit(user,lock,record),lock);
      } catch(error) {
        if(record&&error.code==='catalog_cancelled'&&lock.phase!=='withdrawn'){
          await store.put(user,record.id,withdraw(record));lock.phase='withdrawn';
        }
        throw error;
      } finally {signal?.removeEventListener('abort',abort);release(user,lock);}
    },
    async cancel(context,id) {
      const user=await owner(context);if(!validId(id))fail('workspace_not_found');
      const lock=locks.get(user);
      if(lock?.id===id&&lock.cancellable&&lock.phase!=='committed'){lock.controller.abort();return {cancellation_requested:true};}
      await read(user,id,false);return {cancellation_requested:false};
    },
    async delete(context,id) {
      const user=await owner(context);if(!validId(id))fail('workspace_not_found');
      const activeLock=locks.get(user);
      if(activeLock?.id===id){if(activeLock.phase!=='committed')activeLock.controller.abort();await activeLock.settled;}
      const lock=acquire(user,id);
      try {await read(user,id,false);await store.delete(user,id);lock.phase='committed';return {deleted:true};}
      finally {release(user,lock);}
    },
  };
  return api;
}
module.exports={createPrivateCollectorWorkspace,createMemoryStore,createLocalDecisionStore};
