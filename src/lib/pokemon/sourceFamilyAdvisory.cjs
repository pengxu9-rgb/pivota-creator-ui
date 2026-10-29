"use strict";
// Explicit source-family admission. Exact-variant fields remain independent.
const {createHash}=require("node:crypto");
const {AsyncLocalStorage}=require("node:async_hooks");
const {PRIVATE_ROUTE_MS}=require("./requestBudgets.cjs");
const catalogMedia=require("./catalogMedia.cjs");
const FLAGS=["physical_printing_verified","physical_finish_verified","listing_copy_verified","matching_enable_allowed","price_comparable","automatic_offer_join_allowed","display_allowed","public_display_allowed","source_access_approved","raw_rarity_overwrite_allowed","raw_identity_overwrite_allowed","physical_variant_mapping_established","printed_number_verified","same_artwork_verified"];
const ID=["card_id","language","set_code","collector_number","variant","name","rarity","provenance","match_eligible","display_allowed","rights_reference","attributes_json"];
const STAGES=new Set(["Basic","BREAK","LEVEL-UP","MEGA","RESTORED","Stage1","Stage2","VMAX","V-UNION","Baby","VSTAR"]);
const TYPES=new Set(["Colorless","Darkness","Dragon","Fairy","Fighting","Fire","Grass","Lightning","Metal","Psychic","Water"]);
function need(v){if(!v)throw Object.assign(new TypeError("invalid_source_family_advisory"),{code:"invalid_live_catalog_response"});}
function object(v){return v!==null&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;}
function keys(v,want){need(object(v)&&Object.keys(v).sort().join("\0")===[...want].sort().join("\0"));}
function canonical(v){
 if(typeof v==="string"){for(const c of v){const n=c.codePointAt(0);need(n<0xd800||n>0xdfff);}return JSON.stringify(v);}
 if(v===null||typeof v==="boolean")return JSON.stringify(v);
 if(typeof v==="number"){need(Number.isSafeInteger(v));return JSON.stringify(v);}
 if(Array.isArray(v))return"["+v.map(canonical).join(",")+"]";
 need(object(v));return"{"+Object.keys(v).sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b))).map(k=>canonical(k)+":"+canonical(v[k])).join(",")+"}";
}
const hash=v=>createHash("sha256").update(canonical(v)).digest("hex"),pin=v=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
const nativeSourceURL=id=>"https://api.tcgdex.net/v2/en/cards/"+encodeURIComponent(id).replace(/[!'()*]/g,c=>"%"+c.charCodeAt(0).toString(16).toUpperCase());
function literal(v){return typeof v==="string"&&v.length>0&&v.length<=160&&v===v.trim()&&!/[\x00-\x1f]/.test(v)&&!new Set(["unknown","none","null","n/a","na","not available","not declared","?","-"]).has(v.toLowerCase());}
function validateEvidence(context,current,admitted){
 // These anchors must be supplied by an independently admitted immutable native
 // event/snapshot. Deriving them from this context would merely self-reseal it.
 keys(admitted,["evidence_sha256","source_sha256","receipt_sha256","association_sha256","authority_snapshot_sha256"]);need(Object.values(admitted).every(pin));
 keys(context,["schema","scope","evidence","display_label","scope_note","existing_card_fields_must_remain_unchanged","frontend_projection","admission"]);
 need(context.schema==="pokemon.source-card-family-advisory-context.v2"&&context.scope==="advisory_source_card_family_only"&&context.display_label==="Source card family facts"&&context.scope_note==="Family reference only. Printing, finish, copy and printed-number verification remain unestablished."&&context.existing_card_fields_must_remain_unchanged===true);
 const e=context.evidence;keys(e,["schema","scope","evidence_id","revision","card_id","identity","identity_sha256","association","observation","source_facts","variant_uncertainty","authority_snapshot_sha256","recorded_at",...FLAGS]);
 need(e.schema==="pokemon.source-card-family-advisory-evidence.v1"&&e.scope===context.scope&&FLAGS.every(k=>e[k]===false)&&Number.isSafeInteger(e.revision)&&e.revision>=1);
 need(hash(e)===admitted.evidence_sha256&&e.authority_snapshot_sha256===admitted.authority_snapshot_sha256);const unsigned={...e};delete unsigned.evidence_id;need(e.evidence_id==="source-family-advisory:"+hash(unsigned));
 keys(current,ID);keys(e.identity,ID);need(canonical(current)===canonical(e.identity)&&e.identity_sha256===hash(current)&&e.card_id===current.card_id&&current.language==="en"&&current.card_id.startsWith("en:")&&Number.isInteger(current.match_eligible)&&[0,1].includes(current.match_eligible)&&current.display_allowed===0);
 const a=e.association;keys(a,["kind","native_card_id","local_id","set_id","compiler_source_sha256","card_module","set_module"]);need(a.kind==="exact_pinned_module_filename_and_provider_compiler_ID_rule"&&pin(a.compiler_source_sha256)&&hash(a)===admitted.association_sha256);keys(a.card_module,["archive_member","sha256"]);keys(a.set_module,["archive_member","official_count","set_id","sha256"]);need(pin(a.card_module.sha256)&&pin(a.set_module.sha256)&&a.set_id===a.set_module.set_id&&Number.isSafeInteger(a.set_module.official_count)&&a.set_module.official_count>=0);
 const o=e.observation;keys(o,["native_card_id","url","source_sha256","source_bytes","receipt_sha256","captured_at","receipt_schema"]);need(o.native_card_id===a.native_card_id&&o.url===nativeSourceURL(a.native_card_id)&&o.source_sha256===admitted.source_sha256&&o.receipt_sha256===admitted.receipt_sha256&&Number.isSafeInteger(o.source_bytes)&&o.source_bytes>0&&o.source_bytes<=2097152&&o.receipt_schema==="pokemon.EN774-native-detail-receipt.v1"&&Number.isFinite(Date.parse(o.captured_at))&&Number.isFinite(Date.parse(e.recorded_at))&&Date.parse(e.recorded_at)>=Date.parse(o.captured_at));
 const f=e.source_facts;keys(f,["card_details","illustrator","illustrator_status","rarity_literal","rarity_status"]);need(f.illustrator===null?f.illustrator_status==="not_declared":literal(f.illustrator)&&f.illustrator_status==="source_declared");need(f.rarity_literal===null?f.rarity_status==="not_declared":typeof f.rarity_literal==="string"&&f.rarity_literal.length>0&&f.rarity_literal.length<=160&&f.rarity_status==="source_declared");
 const d=f.card_details;keys(d,["category","hp","types","stage","stage_source_literal","field_statuses"]);keys(d.field_statuses,["category","hp","types","stage"]);need(d.category===null?[d.hp,d.types,d.stage,d.stage_source_literal].every(x=>x===null):["Pokemon","Trainer","Energy"].includes(d.category));need(d.field_statuses.category===(d.category===null?"not_declared":"source_declared"));
 need(d.stage_source_literal===null||STAGES.has(d.stage_source_literal));
 for(const name of["hp","types","stage"]){const value=d[name];const expected=value!==null?"source_declared":d.category==="Pokemon"||d.category===null?"not_declared":"not_applicable";need(d.field_statuses[name]===expected);}
 if(d.category!=="Pokemon")need(d.hp===null&&d.types===null&&d.stage===null);
 else{need(d.hp===null||Number.isSafeInteger(d.hp)&&d.hp>=1&&d.hp<=10000);need(d.types===null||Array.isArray(d.types)&&d.types.length>0&&d.types.length<=4&&new Set(d.types).size===d.types.length&&d.types.every(t=>TYPES.has(t)));need(d.stage===d.stage_source_literal);}
 const u=e.variant_uncertainty;keys(u,["raw_variant_unchanged","raw_attributes_unchanged","literal_provider_flags","literal_provider_variants","physical_variant_mapping_established","standard_or_opaque_mapping_inferred"]);need(u.raw_variant_unchanged===current.variant&&u.raw_attributes_unchanged===current.attributes_json&&u.physical_variant_mapping_established===false&&u.standard_or_opaque_mapping_inferred===false);need(u.literal_provider_flags===null||object(u.literal_provider_flags)&&Object.values(u.literal_provider_flags).every(v=>typeof v==="boolean"));need(u.literal_provider_variants===null||Array.isArray(u.literal_provider_variants)&&u.literal_provider_variants.length<=100&&u.literal_provider_variants.every(v=>object(v)&&Object.keys(v).every(k=>["type","size","stamp","variantId"].includes(k))&&Object.entries(v).every(([k,x])=>k==="stamp"?Array.isArray(x)&&x.every(literal):literal(x))));
 return context;
}
const operationStorage=new AsyncLocalStorage();
const STATUS_KEYS=["schema","scope","catalog_revision","capsule_sha256","database_sha256","source_policy_sha256","active_root","active_count","capture_root","capture_count"];
const PROJECTION_KEYS=["official_metadata","provider_metadata","pinned_publisher_metadata","official_anchored_details","source_corrections","official_coordinate_family","printing_source_evidence","printed_artist_credit","variant_dimension_hold","current_illustrators","reference_records"];
const ACTIVE_KEYS=["schema","card_id","identity_sha256","global_head","evidence_sha256","source_sha256","receipt_sha256","association_sha256","capture_leaf_sha256","authority_snapshot_sha256","reference_snapshot_sha256","frontend_projection_sha256"];
const scopeError=()=>Object.assign(new Error("catalog_snapshot_changed"),{code:"catalog_snapshot_changed"});
function freeze(value){if(value&&typeof value==="object"&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
function validateAdmissionStatus(value){
 keys(value,STATUS_KEYS);need(value.schema==="pokemon.source-card-family-admission-status.v1"&&value.scope==="advisory_source_card_family_only");
 need(STATUS_KEYS.filter(k=>!["schema","scope","active_count","capture_count"].includes(k)).every(k=>pin(value[k])));
 need(Number.isSafeInteger(value.active_count)&&value.active_count>=1&&value.active_count<=4096&&Number.isSafeInteger(value.capture_count)&&value.capture_count>=value.active_count&&value.capture_count<=4096);
 return freeze(JSON.parse(JSON.stringify(value)));
}
function verifyProof(leaf,proof,root,count){
 keys(proof,["schema","index","count","siblings"]);need(proof.schema==="pokemon.source-card-family-merkle-proof.v1"&&Number.isSafeInteger(count)&&count>=1&&count<=4096&&proof.count===count&&Number.isSafeInteger(proof.index)&&proof.index>=0&&proof.index<count&&Array.isArray(proof.siblings)&&proof.siblings.length===Math.ceil(Math.log2(count))&&proof.siblings.length<=12&&pin(root));
 let current=createHash("sha256").update(Buffer.from([0])).update(canonical(leaf)).digest("hex"),index=proof.index,width=count;
 for(const sibling of proof.siblings){need(pin(sibling));if((index^1)>=width)need(sibling===current);const left=index&1?sibling:current,right=index&1?current:sibling;current=createHash("sha256").update(Buffer.from([1])).update(Buffer.from(left,"hex")).update(Buffer.from(right,"hex")).digest("hex");index=Math.floor(index/2);width=Math.ceil(width/2);}
 need(index===0&&width===1&&current===root);return true;
}
function parseIdentityAttributes(text){need(typeof text==="string"&&Buffer.byteLength(text)<=2097152);let value;try{value=JSON.parse(text);}catch{need(false);}need(object(value));canonical(value);return value;}
function rawIdentity(card,context){
 need(object(card)&&object(context)&&object(context.evidence));const raw=catalogMedia.sourceIdentityCard(card,hash),identity={};
 for(const key of ID){if(key!=="attributes_json")identity[key]=raw[key];}
 const declared=context.evidence.identity;need(object(declared)&&Object.prototype.hasOwnProperty.call(raw,"attributes"));const attributes=parseIdentityAttributes(declared.attributes_json);need(canonical(attributes)===canonical(raw.attributes));identity.attributes_json=declared.attributes_json;keys(identity,ID);return identity;
}
function normalizeReferences(rows){need(Array.isArray(rows)&&rows.length<=100);return rows.map(row=>{need(object(row));const out={...row};if(Object.prototype.hasOwnProperty.call(out,"attributes_json")){need(!Object.prototype.hasOwnProperty.call(out,"attributes"));out.attributes=parseIdentityAttributes(out.attributes_json);delete out.attributes_json;}return out;});}
function compareProjection(projection,card,detail){
 keys(projection,PROJECTION_KEYS);
 for(const key of PROJECTION_KEYS.filter(k=>!["current_illustrators","reference_records"].includes(k)))need(canonical(projection[key])===canonical(Object.prototype.hasOwnProperty.call(card,key)?card[key]:null));
 need(Array.isArray(projection.current_illustrators)&&projection.current_illustrators.length<=100);for(const row of projection.current_illustrators){keys(row,["value","provenance","rights_reference"]);need(typeof row.value==="string"&&row.value.length>0&&typeof row.provenance==="string"&&(row.rights_reference===null||typeof row.rights_reference==="string"));}
 const sorted=rows=>rows.map(row=>({value:row.value,provenance:row.provenance,rights_reference:row.rights_reference})).sort((a,b)=>Buffer.compare(Buffer.from(canonical(a)),Buffer.from(canonical(b))));
 if(Object.prototype.hasOwnProperty.call(card,"current_illustrators")){need(Array.isArray(card.current_illustrators));need(canonical(sorted(card.current_illustrators))===canonical(sorted(projection.current_illustrators)));}
 if(detail){need(detail.card===card&&Array.isArray(detail.discovery_facets)&&Array.isArray(detail.reference_records));need(canonical(sorted(detail.discovery_facets.filter(f=>f.facet_type==="illustrator")))===canonical(sorted(projection.current_illustrators)));need(canonical(normalizeReferences(projection.reference_records))===canonical(normalizeReferences(detail.reference_records)));}
 else normalizeReferences(projection.reference_records);
}
function validateFamilyCard(card,status,detail){
 if(!Object.prototype.hasOwnProperty.call(card,"source_family_advisory"))return null;
 const context=card.source_family_advisory,anchor=validateAdmissionStatus(status);need(object(context)&&object(context.admission));const a=context.admission;keys(a,[...STATUS_KEYS.filter(k=>!["schema","scope"].includes(k)),"leaf","proof"]);
 for(const key of STATUS_KEYS.filter(k=>!["schema","scope"].includes(k))){if(a[key]!==anchor[key])throw scopeError();}
 const leaf=a.leaf;keys(leaf,ACTIVE_KEYS);need(leaf.schema==="pokemon.source-card-family-active-leaf.v1"&&leaf.card_id===card.card_id);keys(leaf.global_head,["evidence_id","revision","record_commitment_sha256"]);need(/^source-family-ledger:[a-f0-9]{64}$/.test(leaf.global_head.evidence_id)&&Number.isSafeInteger(leaf.global_head.revision)&&leaf.global_head.revision>=1&&leaf.global_head.evidence_id==="source-family-ledger:"+leaf.global_head.record_commitment_sha256);
 need(ACTIVE_KEYS.filter(k=>!["schema","card_id","global_head"].includes(k)).every(k=>pin(leaf[k])));verifyProof(leaf,a.proof,anchor.active_root,anchor.active_count);
 const current=rawIdentity(card,context);need(leaf.identity_sha256===hash(current)&&leaf.frontend_projection_sha256===hash(context.frontend_projection));
 const admitted={evidence_sha256:leaf.evidence_sha256,source_sha256:leaf.source_sha256,receipt_sha256:leaf.receipt_sha256,association_sha256:leaf.association_sha256,authority_snapshot_sha256:leaf.authority_snapshot_sha256};validateEvidence(context,current,admitted);need(leaf.global_head.revision===context.evidence.revision);compareProjection(context.frontend_projection,card,detail);return freeze(context);
}
function currentOperation(){return operationStorage.getStore();}
function operationGuard(signal){const op=currentOperation();signal?.throwIfAborted();op?.signal?.throwIfAborted();if(op&&Date.now()>=op.deadline)throw Object.assign(new Error("catalog_timeout"),{code:"catalog_timeout"});}
function withFamilyOperation(run,{signal,deadline,timeoutMs=20000,maxBytes=8*1024*1024}={}){
 need(typeof run==="function"&&Number.isSafeInteger(maxBytes)&&maxBytes>=1024&&maxBytes<=16*1024*1024);if(currentOperation()){operationGuard(signal);return run();}const end=deadline===undefined?Date.now()+timeoutMs:deadline;need(Number.isSafeInteger(end)&&end>Date.now()&&end<=Date.now()+PRIVATE_ROUTE_MS);const op={signal,deadline:end,bytes:0,maxBytes,anchor:null,statusRead:null};return operationStorage.run(op,run);
}
function chargeBytes(n){need(Number.isSafeInteger(n)&&n>=0);const op=currentOperation();if(!op)return;operationGuard();op.bytes+=n;if(op.bytes>op.maxBytes)throw Object.assign(new Error("live_response_too_large"),{code:"live_response_too_large"});}
function familyCards(value){
 const cards=new Map(),visited=new WeakSet();let nodes=0;
 function walk(v,depth,revision){
  if(v===null||typeof v!=="object")return;need(depth<=64&&++nodes<=131072);if(visited.has(v))return;visited.add(v);
  const snake=typeof v.catalog_revision==="string"?v.catalog_revision:null,camel=typeof v.catalogRevision==="string"?v.catalogRevision:null;
  if(snake!==null&&camel!==null&&snake!==camel)throw scopeError();
  const rev=snake!==null?snake:camel!==null?camel:revision;
  if(object(v.card)&&Object.prototype.hasOwnProperty.call(v.card,"source_family_advisory")){const detail=Object.prototype.hasOwnProperty.call(v,"discovery_facets")||Object.prototype.hasOwnProperty.call(v,"reference_records")?v:null;cards.set(v.card,{card:v.card,detail,revision:rev});}
  if(Object.prototype.hasOwnProperty.call(v,"source_family_advisory")&&!cards.has(v))cards.set(v,{card:v,detail:null,revision:rev});
  for(const [key,child]of Object.entries(v)){if(key==="source_family_advisory")continue;walk(child,depth+1,rev);}
 }
 walk(value,0,null);return [...cards.values()];
}
function awaitAnchor(promise,signal){
 const op=currentOperation();need(op);operationGuard(signal);
 return new Promise((resolve,reject)=>{
  let done=false;const signals=[...new Set([signal,op.signal].filter(Boolean))];
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);for(const s of signals)s.removeEventListener("abort",abort);if(error)reject(error);else resolve(value);};
  const abort=()=>finish(Object.assign(new Error("catalog_cancelled"),{code:"catalog_cancelled"}));
  const timer=setTimeout(()=>finish(Object.assign(new Error("catalog_timeout"),{code:"catalog_timeout"})),Math.max(0,op.deadline-Date.now()));
  for(const s of signals)s.addEventListener("abort",abort,{once:true});
  if(signals.some(s=>s.aborted))abort();
  Promise.resolve(promise).then(value=>{try{operationGuard(signal);finish(null,value);}catch(error){finish(error);}},error=>finish(error));
 });
}
async function readStatusOnce(readStatus,signal){
 const op=currentOperation();need(op&&typeof readStatus==="function");operationGuard(signal);
 if(!op.statusRead)op.statusRead=Promise.resolve().then(async()=>{operationGuard(signal);const raw=await readStatus(signal);operationGuard(signal);need(object(raw));return raw;});
 return awaitAnchor(op.statusRead,signal);
}
async function validateFamilyPresentation(value,{readStatus,signal}={}){
 const cards=familyCards(value);if(!cards.length)return value;need(typeof readStatus==="function");const op=currentOperation();need(op);operationGuard(signal);
 if(!op.anchor)op.anchor=Promise.resolve().then(async()=>{operationGuard(signal);const raw=await readStatusOnce(readStatus,signal);operationGuard(signal);const anchor=validateAdmissionStatus(raw.source_family_admission);if(Object.prototype.hasOwnProperty.call(raw,"catalog_revision")&&raw.catalog_revision!==anchor.catalog_revision)throw scopeError();return anchor;});
 const status=await awaitAnchor(op.anchor,signal);operationGuard(signal);
 for(const entry of cards){operationGuard(signal);if(entry.revision!==null&&entry.revision!==status.catalog_revision)throw scopeError();validateFamilyCard(entry.card,status,entry.detail);}
 return value;
}
async function admitStoredPresentation(value, admit){if(!familyCards(value).length)return value;need(typeof admit==="function");await admit(value);return value;}
module.exports={readStatusOnce,hasFamily: value => familyCards(value).length > 0,admitStoredPresentation,validateAdmissionStatus,verifyProof,validateFamilyCard,validateFamilyPresentation,withFamilyOperation,chargeBytes,currentOperation,operationGuard,canonical,hash,nativeSourceURL,FLAGS};
