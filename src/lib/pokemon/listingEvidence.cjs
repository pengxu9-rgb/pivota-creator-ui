"use strict";

// These are evidence assertions made by the bounded server producer. The
// browser never turns a query, title or a picture into a catalog match.
const fields = ["language", "set_code", "collector_number", "finish", "edition"];
const fail = () => { throw Object.assign(new Error("invalid_commerce_response"), {code:"invalid_commerce_response"}); };
const text = (v,max=2048) => typeof v==="string" && v.trim()===v && v.length>0 && v.length<=max && !/[\x00-\x1f\x7f]/.test(v);
const exact = (v,keys) => v && typeof v==="object" && !Array.isArray(v) && Object.keys(v).sort().join() === [...keys].sort().join();
const instant = value => {
  if(typeof value!=="string"||value.length>40)return false;
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!m&&Number(m[1])>=1&&Number(m[2])>=1&&Number(m[2])<=12&&Number(m[3])>=1&&
    Number(m[3])<=new Date(Date.UTC(Number(m[1]),Number(m[2]),0)).getUTCDate()&&Number(m[4])<=23&&Number(m[5])<=59&&Number(m[6])<=59&&
    (m[8]==="Z"||Number(m[9])<=23&&Number(m[10])<=59)&&Number.isFinite(Date.parse(value));
};
const micros = v => BigInt(Date.parse(v))*1000n+BigInt((/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(v)?.[1]||"").padEnd(6,"0").slice(3));
const before = (a,b) => instant(a)&&instant(b)&&micros(a)<=micros(b);
const canonicalClaim = (field,v) => {
  if(v===null)return true;
  if(!text(v,160))return false;
  if(field==="language")return ["ja","en","zh-Hans","zh-Hant","ko","fr","de","es","it","pt"].includes(v);
  if(field==="set_code")return /^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(v);
  if(field==="collector_number")return /^[A-Z]?[0-9]{1,4}[A-Z]?(?:\/[A-Z]?[0-9]{1,4}[A-Z]?)?$/.test(v)&&v.replace(/[0-9]+/g,n=>String(Number(n)))===v;
  if(field==="finish")return ["normal","holo","reverse","reverse_masterball","reverse_pokeball","cosmos_holo","alternate_holo"].includes(v);
  return ["first_edition","unlimited","shadowless","standard","not_applicable"].includes(v);
};

function validateIdentityEvidence(o) {
  const e=o?.identity_evidence;
  if(e===undefined) { if(o?.identity_status==="exact_match" || o?.identity_status==="identity_conflict") fail(); return; }
  if(!exact(e,["status","target_card_id","target","claims","matched_fields","missing_fields","conflicting_fields","listing_url","evidence_ref","observed_at","basis","authenticity_verified"]) ||
     !["exact_match","candidate","conflict"].includes(e.status) || !["exact_listing_structured","unavailable"].includes(e.basis) ||
     e.authenticity_verified!==false || !before(e.observed_at,o.observed_at) ||
     !(e.target_card_id===null||text(e.target_card_id,256)) || (e.target===null)!==(e.target_card_id===null) ||
     !exact(e.claims,fields) || fields.some(f=>!canonicalClaim(f,e.claims[f]))) fail();
  if(e.target!==null && (!exact(e.target,[...fields,"evidence_ref"]) || fields.some(f=>!canonicalClaim(f,e.target[f])) || !text(e.target.evidence_ref))) fail();
  const arrays=[e.matched_fields,e.missing_fields,e.conflicting_fields];
  if(arrays.some(a=>!Array.isArray(a)||a.length>fields.length||new Set(a).size!==a.length||a.some(f=>!fields.includes(f))) ||
     arrays.flat().length!==fields.length || new Set(arrays.flat()).size!==fields.length) fail();
  if(e.basis==="unavailable") {
    if(e.listing_url!==null||e.evidence_ref!==null||e.status!=="candidate"||e.matched_fields.length||e.conflicting_fields.length||fields.some(f=>e.claims[f]!==null)) fail();
  } else if(o.scope!=="listing" || e.listing_url!==o.url || !text(e.listing_url) || !text(e.evidence_ref)) fail();
  if(e.matched_fields.some(f=>e.target?.[f]==null || e.claims[f]==null || e.target[f]!==e.claims[f]) ||
     e.missing_fields.some(f=>e.target?.[f]!=null && e.claims[f]!=null)) fail();
  if(e.status==="exact_match") {
    if(e.basis!=="exact_listing_structured" || e.matched_fields.length!==fields.length || e.missing_fields.length || e.conflicting_fields.length ||
       o.identity_status!=="exact_match" || o.card_id!==e.target_card_id || !text(o.card_id,256)) fail();
  } else if(e.status==="conflict") {
    if(!e.conflicting_fields.length || o.identity_status!=="identity_conflict") fail();
  } else if(e.conflicting_fields.length || !e.missing_fields.length || !["unresolved","unverified_candidate"].includes(o.identity_status)) fail();
  if(o.card_id!=null && (o.card_id!==e.target_card_id || !text(o.card_id,256))) fail();
  return e;
}

function identityView(o) {
  try { validateIdentityEvidence(o); } catch { return {exact:false,conflict:true,evidence:null}; }
  return {exact:o?.identity_status==="exact_match" && o?.identity_evidence?.status==="exact_match",
    conflict:o?.identity_status==="identity_conflict",evidence:o?.identity_evidence??null};
}

function listingPhotoUrl(value,source,synthetic=false) {
  if(!text(value,2048)||value.includes("\\"))return null;
  try {
    const u=new URL(value);
    if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.port&&u.port!=="443"||u.pathname.includes("%")||/(?:^|\/)\.{1,2}(?:\/|$)/.test(value.replace(/^https:\/\/[^/]+/,"")))return null;
    const raster=/\.(?:jpg|jpeg|png|webp)$/i;
    if(!raster.test(u.pathname))return null;
    if(synthetic===true)return u.hostname==="images.example.invalid"&&/^\/listings\/[A-Za-z0-9_/-]+\.(?:jpg|jpeg|png|webp)$/i.test(u.pathname)?value:null;
    const allowed=source==="mercari" ? u.hostname==="static.mercdn.net"&&/^\/item\/detail\/orig\/photos\/[A-Za-z0-9_./-]+$/.test(u.pathname) :
      ["ebay","ebay_us"].includes(source) ? u.hostname==="i.ebayimg.com"&&/^\/images\/g\/[A-Za-z0-9_~./!-]+$/.test(u.pathname) :
      source==="snkrdunk" ? u.hostname==="images.snkrdunk.com"&&/^\/[A-Za-z0-9_./-]+$/.test(u.pathname) : false;
    return allowed?value:null;
  }catch{return null;}
}

function validateListingPhotos(o) {
  if(o?.listing_photos===undefined)return [];
  if(!Array.isArray(o.listing_photos)||o.listing_photos.length>8||o.scope!=="listing"&&o.listing_photos.length)fail();
  const seen=new Set();
  for(const p of o.listing_photos) {
    if(!exact(p,["url","role","listing_url","evidence_ref","observed_at"]) || p.role!=="listing_photo" || p.listing_url!==o.url ||
       !listingPhotoUrl(p.url,o.source,o.synthetic) || !text(p.evidence_ref) || !before(p.observed_at,o.observed_at) || seen.has(p.url))fail();
    seen.add(p.url);
  }
  return o.listing_photos;
}
function listingPhotos(o) {try{return validateListingPhotos(o);}catch{return [];}}

function validateCoverage(research) {
  const c=research?.coverage;
  if(c===undefined)return;
  const counts=["returned_listings","exact_match_listings","candidate_listings","conflicting_listings","sold_listings","listings_with_photos"];
  if(!exact(c,[...counts,"search_limit_per_source","exhaustive","live_coverage_verified"]) || c.exhaustive!==false || c.live_coverage_verified!==false ||
     ![null,3].includes(c.search_limit_per_source) || counts.some(k=>!Number.isSafeInteger(c[k])||c[k]<0||c[k]>research.offers.length))fail();
  const offers=research.offers;
  if(c.returned_listings!==offers.length || c.exact_match_listings!==offers.filter(o=>o.identity_status==="exact_match").length ||
     c.conflicting_listings!==offers.filter(o=>o.identity_status==="identity_conflict").length ||
     c.candidate_listings!==offers.filter(o=>!["exact_match","identity_conflict"].includes(o.identity_status)).length ||
     c.sold_listings!==offers.filter(o=>o.availability==="sold_out").length || c.listings_with_photos!==offers.filter(o=>o.listing_photos?.length>0).length)fail();
  return c;
}

module.exports={validateIdentityEvidence,identityView,listingPhotoUrl,validateListingPhotos,listingPhotos,validateCoverage};
