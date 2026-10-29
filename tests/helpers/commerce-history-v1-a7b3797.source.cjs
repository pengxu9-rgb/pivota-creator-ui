'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {validateCommerceRequest,validateCommerceResponse}=require('./commerceContract.cjs');
const {observationIsCurrent,sellerEvidenceBinding,listingSemanticBinding,urlQuoteIdentityStatus}=require('./bnsChatState.cjs');
const {sellerIdentityTuple}=require('./sellerEvidence.cjs');
const {offerEvidence}=require('./offerEvidence.cjs');
const {MESSAGES}=require('./bnsPreview.cjs');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const fingerprint=(op,p)=>createHash('sha256').update(JSON.stringify([op,p])).digest('hex');
const handleHash=v=>createHash('sha256').update('commerce-selection:'+v).digest('hex');
const offerHash=(card,o)=>fingerprint('observed-offer',[card,o.offer_id,o.observed_at,o.price_minor,o.currency]);
const evidenceHash=o=>fingerprint('full-offer-v3',[o.offer_id,o.source,o.native_id,o.title,o.url,o.price_minor,o.currency,o.availability,o.observed_at,o.fresh_until??null,o.scope,o.identity_status,sellerEvidenceBinding(o),sellerIdentityTuple(o),listingSemanticBinding(o)]);
// A quote may be a fresh capture of unchanged terms. Bind semantic evidence,
// while the returned quote listing retains its own new capture reference.
const quoteBinding=(card,o)=>fingerprint('quote-binding-v2',[card,o.source,o.native_id,o.title,o.url,o.price_minor,o.price_minor===null?null:o.currency,urlQuoteIdentityStatus(o),sellerEvidenceBinding(o,false)]);
const catalogAnchor=v=>typeof v==='string'&&v.length<=240&&/^[a-z]{2}:[^:\s/\\?#]{1,80}:[A-Za-z0-9/._-]{1,80}:[^:\s/\\?#]{1,80}$/.test(v);
const labels={research:'Seller listing research',select:'Seller listing choice',handoff:'Forwarder review',psa:'PSA record lookup'};
const errors=new Set(['read_only_scope','offer_changed','offer_unavailable','grade_review_required','selection_expired','selection_not_found','invalid_request','unsupported_url','unsupported_forwarder','quote_unavailable','commerce_unavailable','commerce_not_configured','invalid_commerce_response','cancelled']);
function context(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='id,request_id,version'||!uuid(value.id)||!uuid(value.request_id)||!Number.isInteger(value.version)||value.version<0)fail('invalid_commerce_request');
  return value;
}
function begin(doc,{version,request_id,operation,request},now=Date.now()){
  validateCommerceRequest(operation,request);
  if(['research','select'].includes(operation)&&!catalogAnchor(request.card_id))fail('invalid_commerce_request');
  if(!uuid(request_id)||!Number.isInteger(version))fail('invalid_commerce_request');
  const hash=fingerprint(operation,request),duplicate=doc.messages.find(m=>m.commerceInternal?.request_id===request_id);
  if(duplicate)fail(duplicate.commerceInternal.request_hash===hash?'commerce_check_already_recorded':'invalid_commerce_request');
  if(doc.version!==version)fail('chat_version_conflict');
  if(doc.pending||doc.commercePending)fail('logical_turn_in_progress');
  if(doc.messages.filter(m=>m.commerce).length>=100)fail('commerce_history_limit');
  if(operation==='select'&&(!doc.commerceAnchor||doc.commerceAnchor.card_id!==request.card_id||!doc.commerceAnchor.offer_hashes?.some(o=>o.request_hash===offerHash(request.card_id,{offer_id:request.offer_id,observed_at:request.expected_observed_at,price_minor:request.expected_price_minor,currency:request.currency}))))fail('commerce_reselection_required');
  if(operation==='handoff'&&(!doc.commerceAnchor||doc.commerceAnchor.selection_hash!==handleHash(request.selection_id)||doc.commerceAnchor.expiresAt<=now))fail('commerce_reselection_required');
  if(operation==='handoff'&&!doc.commerceAnchor.forwarders?.some(p=>p.id_hash===fingerprint('forwarder',request.forwarder)&&(p.quote||p.manual)))fail('commerce_reselection_required');
  const id=randomUUID(),anchor=operation==='handoff'?doc.commerceAnchor.card_id:request.card_id;
  const summary={schema:'pokemon.chat-commerce-summary.v1',actor:'user_action',operation,started_at:new Date(now).toISOString(),recorded_at:new Date(now).toISOString(),status:'pending',requires_refresh:true,...(anchor?{card_id:anchor}:{})};
  validateSummary(summary);
  const message={id,role:'assistant',status:'submitted',text:labels[operation]+' is running.',createdAt:now,commerce:summary,commerceInternal:{request_id,request_hash:hash}};
  return {...doc,version:doc.version+1,updatedAt:now,title:doc.messages.length?doc.title:labels[operation],messages:[...doc.messages,message],commercePending:{id,operation,request_hash:hash,version:doc.version+1,expiresAt:now+(operation==='research'?75000:40000)}};
}
function finish(doc,{event_id,operation,request,response,error},now=Date.now()){
  const held=doc.commercePending;
  if(!held||held.id!==event_id||held.operation!==operation||held.version!==doc.version||held.request_hash!==fingerprint(operation,request))fail('chat_version_conflict');
  if(held.expiresAt<=now)fail('commerce_reservation_expired');
  const message=doc.messages.find(m=>m.id===event_id),summary={...message.commerce,recorded_at:new Date(now).toISOString()};
  let text,anchor=doc.commerceAnchor;
  if(error){if(!errors.has(error))error='commerce_unavailable';summary.status=error==='cancelled'?'interrupted':'failed';summary.error_code=error;text=labels[operation]+' did not complete. Refresh before continuing.';if(operation!=='psa')anchor=null;}
  else{
    validateCommerceResponse(operation,response);
    if(operation==='research'){
      if(response.card_id!==request.card_id)fail('invalid_commerce_response');
      summary.status='researched';summary.offer_count=response.offers.length;summary.checked_at=response.checked_at;
      summary.platforms=response.platforms.map(p=>({source:['mercari','ebay_us','ebay','snkrdunk'].includes(p.source)?p.source:'other',status:['ok','partial','unavailable','blocked','researched','synthetic_fixture','no_results'].includes(p.status)?p.status:'reported'}));text='Seller listing research completed. Open the current check to review its evidence.';anchor={card_id:request.card_id,offer_hashes:response.offers.map(o=>({request_hash:offerHash(request.card_id,o),evidence_hash:evidenceHash(o)})),forwarders:response.forwarders.map(p=>({id_hash:fingerprint('forwarder',p.id),quote:p.quote_available,manual:p.manual_handoff_available}))};
    }else if(operation==='select'){
      const o=response.offer;
      if(!offerEvidence(o,now).canSelect||!Number.isFinite(Date.parse(response.expires_at))||Date.parse(response.expires_at)<=now||!doc.commerceAnchor?.offer_hashes?.some(original=>original.request_hash===offerHash(request.card_id,o)&&original.evidence_hash===evidenceHash(o))||o.offer_id!==request.offer_id||o.observed_at!==request.expected_observed_at||o.price_minor!==request.expected_price_minor||o.currency!==request.currency)fail('invalid_commerce_response');
      summary.status='selected';summary.expires_at=response.expires_at;text='You chose a seller listing. This choice does not verify the card or seller claims.';anchor={...doc.commerceAnchor,card_id:request.card_id,selection_hash:handleHash(response.selection_id),url_hash:fingerprint('selected-url',o.url),quote_binding_hash:quoteBinding(request.card_id,o),observed_at:o.observed_at,expiresAt:Date.parse(response.expires_at)};
    }else if(operation==='handoff'){
      if(doc.commerceAnchor?.expiresAt<=now)fail('selection_expired');
      const capability=doc.commerceAnchor?.forwarders?.find(p=>p.id_hash===fingerprint('forwarder',request.forwarder));
      if(!capability||(response.quote||response.provider_result?.status==='variant_selection_required')&&!capability.quote||!response.quote&&!response.provider_result&&!capability.manual)fail('invalid_commerce_response');
      if(response.forwarder.id!==request.forwarder||fingerprint('selected-url',response.product_url)!==doc.commerceAnchor?.url_hash)fail('invalid_commerce_response');
      if(response.quote){const q=response.quote,l=q.listing,d=q.buyship.destination;if(!l||!observationIsCurrent(l.observed_at,doc.commerceAnchor.observed_at,q.buyship.quoted_at,now,new Date(doc.commerceAnchor.expiresAt).toISOString())||quoteBinding(q.card_id,{...l,price_minor:l.ask?.subunit_amount??null,currency:l.ask?.currency??null})!==doc.commerceAnchor.quote_binding_hash||!d||d.country!==request.destination.country||(d.state||'')!==(request.destination.state||'')||request.variant_key&&q.buyship.variant_key!==request.variant_key)fail('invalid_commerce_response');}
      summary.status=response.status;summary.provider_code=response.provider_result?.code||null;summary.variant_count=response.provider_result?.details.variants?.length||0;
      if(response.quote)summary.expires_at=response.quote.buyship.expires_at;
      text=response.status==='quote_ready_for_review'?'An informational quote is ready for review. No order or payment was created.':response.status==='variant_selection_required'?'Choose a current in-stock listing option before requesting a quote.':response.provider_result?'A provider quote is unavailable or refused. Review the current check.':'A manual URL handoff is available. No provider quote or order was created.';
    }else{summary.status='psa_record_checked';text='PSA record lookup completed. A certificate record does not authenticate the physical card.';}
  }
  validateSummary(summary);
  return {...doc,version:doc.version+1,updatedAt:now,commercePending:null,commerceAnchor:anchor,messages:doc.messages.map(m=>m.id===event_id?{...m,status:error?'failed':'accepted',text,commerce:summary}:m)};
}
function expire(doc,now=Date.now()){
  if(!doc.commercePending||doc.commercePending.expiresAt>now)return doc;
  const id=doc.commercePending.id;
  return {...doc,version:doc.version+1,updatedAt:now,commercePending:null,commerceAnchor:null,messages:doc.messages.map(m=>m.id===id?{...m,status:'failed',text:'This check was interrupted or expired. Refresh before continuing.',commerce:{...m.commerce,status:'interrupted',recorded_at:new Date(now).toISOString()}}:m)};
}
function cancel(doc,now=Date.now()){
  if(!doc.commercePending)return doc;
  return expire({...doc,commercePending:{...doc.commercePending,expiresAt:now}},now);
}
function validateSummary(v){
  const fields=['schema','actor','operation','started_at','recorded_at','status','requires_refresh','card_id','offer_count','checked_at','expires_at','platforms','variant_count','provider_code','error_code'];
  const statuses=['pending','researched','selected','manual_handoff_required','variant_selection_required','quote_ready_for_review','psa_record_checked','failed','interrupted'];
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!fields.includes(k))||v.schema!=='pokemon.chat-commerce-summary.v1'||v.actor!=='user_action'||!Object.hasOwn(labels,v.operation)||!statuses.includes(v.status)||v.requires_refresh!==true||['started_at','recorded_at'].some(k=>typeof v[k]!=='string'||!Number.isFinite(Date.parse(v[k])))||['checked_at','expires_at'].some(k=>v[k]!==undefined&&(typeof v[k]!=='string'||!Number.isFinite(Date.parse(v[k]))))||v.card_id!==undefined&&!catalogAnchor(v.card_id)||['offer_count','variant_count'].some(k=>v[k]!==undefined&&(!Number.isInteger(v[k])||v[k]<0||v[k]>100))||v.provider_code!=null&&!Object.hasOwn(MESSAGES,v.provider_code)||v.error_code!==undefined&&!errors.has(v.error_code))fail('invalid_commerce_history');
  if(v.platforms!==undefined&&(!Array.isArray(v.platforms)||v.platforms.length>32||v.platforms.some(p=>!p||Object.keys(p).sort().join(',')!=='source,status'||!['mercari','ebay_us','ebay','snkrdunk','other'].includes(p.source)||!['ok','partial','unavailable','blocked','researched','synthetic_fixture','no_results','reported'].includes(p.status))))fail('invalid_commerce_history');
  return v;
}
function publicMessages(messages){return messages.map(({commerceInternal,...message})=>{if(message.commerce)validateSummary(message.commerce);return message;});}
module.exports={context,begin,finish,expire,cancel,publicMessages,validateSummary};
