"use strict";
const {sellerView, platformIdentity} = require("./sellerEvidence.cjs");
const {identityView,listingPhotos}=require("./listingEvidence.cjs");
const listingConflict = Symbol("conflicting listing observations");

const STOCK_LABELS = {
  available: "Seller reports available",
  sold_out: "Sold out",
  unavailable: "Unavailable",
  withdrawn: "Withdrawn",
  unknown: "Stock unknown",
};
const text = value => typeof value === "string" && value.trim() ? value.normalize("NFKC").trim() : null;
const readable = value => value.replace(/_/g, " ");
const positiveInteger = value => Number.isSafeInteger(value) && value > 0 ? value : null;

function offerEvidence(offer, clock = Date.now()) {
  const o = offer && typeof offer === "object" ? offer : {};
  const grade = o.grade && typeof o.grade === "object" ? o.grade : {};
  const gradeCompany = text(grade.company)?.toUpperCase() || null;
  const gradeValue = text(grade.value);
  const specialLabel = text(grade.special_label);
  // A legacy explicit company/value is still a seller slab claim. Missing grade
  // fields do not establish that a card is raw.
  const gradeKind = ["slab", "raw", "unknown"].includes(grade.kind) ? grade.kind :
    grade.kind == null && gradeCompany && gradeValue ? "slab" : "unknown";
  const reviewReasons = [...new Set((Array.isArray(grade.review_reasons) ? grade.review_reasons : []).map(text).filter(Boolean))];
  if (o[listingConflict]) reviewReasons.push("Conflicting observations of this listing");
  if (grade.kind != null && !["slab", "raw", "unknown"].includes(grade.kind)) reviewReasons.push("Unrecognized grade evidence");
  if (gradeKind === "slab" && (!gradeCompany || !gradeValue)) reviewReasons.push("Incomplete slab grade claim");
  if (gradeKind !== "slab" && (gradeCompany || gradeValue || specialLabel)) reviewReasons.push("Grade kind and seller claim disagree");

  const quantities = [o.listing_quantity, o.lot_quantity].filter(value => value != null);
  const validQuantities = quantities.map(positiveInteger);
  const quantityConflict = quantities.length > 0 && (validQuantities.some(value => value === null) || new Set(validQuantities).size > 1);
  const lotQuantity = quantityConflict ? null : validQuantities[0] ?? null;
  if (quantityConflict) reviewReasons.push("Lot quantity needs review");
  const identity=identityView(o);
  if(identity.conflict) reviewReasons.push(o.identity_status==="identity_conflict"?"Card identity evidence conflicts":"Card identity evidence is invalid");
  const reviewRequired = grade.review_required === true || reviewReasons.length > 0;

  const availability = Object.hasOwn(STOCK_LABELS, o.availability) ? o.availability : "unknown";
  const observed = typeof o.observed_at === "string" ? Date.parse(o.observed_at) : NaN;
  const deadline = typeof o.fresh_until === "string" ? Date.parse(o.fresh_until) : NaN;
  const validClock = typeof clock === "number" && Number.isFinite(clock);
  const freshness = validClock && Number.isFinite(deadline) && deadline <= clock ? "expired" :
    validClock && Number.isFinite(observed) && observed <= clock && Number.isFinite(deadline) && deadline > clock && deadline > observed ? "current" : "unreported";
  const identityStatus = text(o.identity_status) || "unknown";
  const cardId = text(o.card_id);
  const exactIdentity = identity.exact && cardId !== null;
  const candidateIdentity = identityStatus === "unverified_candidate";
  const identityLabel = exactIdentity ? "Exact catalog match recorded" : candidateIdentity ? "Catalog match unverified" :
    identityStatus === "identity_conflict" ? "Card identity conflicts" : identityStatus === "unresolved" ? "Exact printing unresolved" : "Catalog identity unknown";
  const currencyText = text(o.currency)?.toUpperCase();
  const currency = currencyText && /^[A-Z]{3}$/.test(currencyText) ? currencyText : null;
  const hasPrice = Number.isSafeInteger(o.price_minor) && o.price_minor >= 0 && currency !== null;
  const sellerCondition = text(o.seller_condition);
  const certificateNumberClaim = text(o.certificate?.number_claim) || text(o.certificate_number_claim);
  // Even a supplied certificate number (or an unexpected verified flag) cannot
  // authenticate this physical item. Exact-offer lookup results are separate.
  const certificateStatus = certificateNumberClaim ? "not_checked" : "number_missing";
  const gradeLabel = gradeKind === "raw" ? "Raw / ungraded seller claim" : gradeKind === "slab" ?
    `${[gradeCompany, gradeValue].filter(Boolean).join(" ") || "Slab grade unknown"}${specialLabel ? ` · ${readable(specialLabel)}` : ""} · seller claim` : "Grade unknown";
  const canSelect = o.scope === "listing" && availability === "available" && freshness === "current" && hasPrice &&
    !reviewRequired && (candidateIdentity || exactIdentity);
  const priceComparable = canSelect && exactIdentity && lotQuantity !== null && gradeKind !== "unknown" &&
    (gradeKind !== "raw" || sellerCondition !== null);

  return {
    gradeKind, gradeCompany, gradeValue, gradeLabel,
    gradeEvidence: text(grade.evidence) || "Seller grade evidence not reported",
    specialLabel, sellerCondition, sourceStatusText: text(o.source_status_text) || text(o.listing_status),
    reviewRequired, reviewReasons,
    reviewLabel: reviewRequired ? "Seller evidence needs review" : "",
    availability, availabilityLabel: STOCK_LABELS[availability],
    freshness, freshnessLabel: freshness === "current" ? "Observation within freshness window" : freshness === "expired" ? "Observation expired" : "Freshness unreported",
    identityStatus, identityLabel, cardId, identityEvidence:identity.evidence, listingPhotos:listingPhotos(o),
    certificateStatus, certificateNumberClaim,
    certificateLabel: certificateNumberClaim ? "Certificate number claimed · not checked" : "Certificate number not extracted",
    physicalAuthenticityLabel: "Physical card authenticity not verified",
    lotQuantity, lotLabel: lotQuantity === null ? "Lot quantity unknown" : `${lotQuantity} ${lotQuantity === 1 ? "card" : "cards"} per listing`,
    currency, hasPrice, canSelect, priceComparable,
    seller: sellerView(o),
  };
}

function listingKey(offer) {
  const source = text(offer?.source), nativeId = text(offer?.native_id);
  return offer?.scope === "listing" && source && nativeId ? JSON.stringify([platformIdentity(source), nativeId]) : null;
}

function observationSnapshot(offer) {
  const o = offer || {}, g = o.grade || {}, s = o.seller || {}, r = s.reputation || {}, c = o.certificate || {};
  return JSON.stringify([platformIdentity(o.source), o.native_id, o.url, o.title, o.price_minor, o.currency, o.availability,
    o.observed_at, o.fresh_until, o.scope, o.identity_status, o.card_id, o.listing_status,
    g.company, g.value, g.kind, g.certificate_verified, g.evidence, g.review_required,
    Array.isArray(g.review_reasons) ? [...g.review_reasons].sort() : g.review_reasons, g.special_label,
    o.seller_condition, o.source_status_text, o.evidence_ref, o.listing_quantity, o.lot_quantity,
    o.certificate_number_claim, c.number_claim, c.status, c.physical_authenticity,
    s.id, s.display_name, s.url, s.observed_at, s.evidence_ref,
    r.rating?.value, r.rating?.scale, r.review_count, r.positive_feedback_percent, r.feedback_score, r.observed_at, r.evidence_ref,
    o.identity_evidence??null,o.listing_photos??[]]);
}

function listingObservations(offers) {
  if (!Array.isArray(offers)) return {offers: [], duplicateObservations: 0, conflictingListings: 0};
  const listings = new Map(), retained = [];
  let duplicateObservations = 0;
  for (const offer of offers) {
    const key = listingKey(offer);
    if (!key) { retained.push({offer}); continue; }
    let listing = listings.get(key);
    if (!listing) { listing = new Map(); listings.set(key, listing); }
    const snapshot = observationSnapshot(offer);
    if (listing.has(snapshot)) { duplicateObservations++; continue; }
    const row = {offer, listing};
    listing.set(snapshot, row); retained.push(row);
  }
  const conflictingListings = [...listings.values()].filter(rows => rows.size > 1).length;
  // Identical captures reached through two routes are one observation. Different
  // versions stay visible and require review; neither price is silently chosen.
  return {offers: retained.map(row => row.listing?.size > 1 ? {...row.offer, [listingConflict]: true} : row.offer), duplicateObservations, conflictingListings};
}

function listingCoverage(offers) {
  const normalized = listingObservations(offers), listings = new Set(), platforms = new Set(), sellers = new Set(), knownSellerListings = new Set(), unknownSellers = new Set();
  for (const offer of normalized.offers) {
    const source = text(offer?.source);
    if (source) platforms.add(platformIdentity(source));
    const key = listingKey(offer);
    if (!key) continue;
    listings.add(key);
    const seller = sellerView(offer);
    if (seller.identityKey) { sellers.add(seller.identityKey); knownSellerListings.add(key); }
    else unknownSellers.add(key);
  }
  return {listings: listings.size, platforms: platforms.size, reportedSellerIdentities: sellers.size,
    listingsWithoutSellerIdentity: [...unknownSellers].filter(key => !knownSellerListings.has(key)).length, observations: normalized.offers.length,
    duplicateObservations: normalized.duplicateObservations, conflictingListings: normalized.conflictingListings};
}

function groupComparableOffers(offers, cardId, clock = Date.now(), options = {}) {
  if (!Array.isArray(offers)) return [];
  const target = text(cardId), groups = new Map();
  for (const offer of listingObservations(offers).offers) {
    const evidence = offerEvidence(offer, clock);
    const matchesTarget = target !== null && evidence.cardId === target;
    const priceComparable = evidence.priceComparable && matchesTarget;
    const key = JSON.stringify([
      target, evidence.cardId, text(offer?.scope), evidence.gradeKind, evidence.gradeCompany, evidence.gradeValue,
      evidence.specialLabel?.toLowerCase().replace(/[\s_]+/g, " ") || null,
      evidence.gradeKind === "raw" ? evidence.sellerCondition?.toLowerCase() || null : null,
      evidence.currency, evidence.identityStatus, evidence.lotQuantity,
      evidence.availability, evidence.freshness, evidence.reviewRequired, evidence.hasPrice,
    ]);
    if (!groups.has(key)) {
      const notes = [];
      if (offer?.scope !== "listing") notes.push("This is not an exact seller listing; it cannot be selected as an offer.");
      if (!target) notes.push("No exact catalog target is bound.");
      else if (evidence.identityStatus !== "exact_match" || !evidence.cardId) notes.push("Exact printing is not verified; no best-price recommendation.");
      else if (!matchesTarget) notes.push("This observation names a different catalog record; no price comparison with the requested card.");
      if (evidence.gradeKind === "unknown") notes.push("Unknown grade is separate from raw and slab claims.");
      if (evidence.gradeKind === "raw" && !evidence.sellerCondition) notes.push("Raw-card condition is unreported.");
      if (evidence.lotQuantity === null) notes.push("Lot quantity is unknown; do not assume one card.");
      if (evidence.reviewRequired) notes.push("Seller evidence needs review before selection.");
      if (evidence.availability !== "available") notes.push(`${evidence.availabilityLabel}; retained as an observation, not a selectable listing.`);
      if (evidence.freshness !== "current") notes.push(`${evidence.freshnessLabel}; refresh before selection.`);
      if (!evidence.hasPrice) notes.push("A price and currency are required for comparison.");
      if (priceComparable) notes.push("Seller asks within this same recorded printing, grade claim, currency and lot quantity only.");
      notes.push("Seller asks are not completed sales or physical authentication.");
      const label = [evidence.gradeLabel, evidence.gradeKind === "raw" ? evidence.sellerCondition : null,
        evidence.currency || "Currency unknown", evidence.lotLabel, evidence.identityLabel,
        evidence.availability !== "available" ? evidence.availabilityLabel : null,
        evidence.reviewRequired ? "Needs review" : null, evidence.freshness !== "current" ? evidence.freshnessLabel : null].filter(Boolean).join(" · ");
      groups.set(key, {key, label, offers: [], comparisonNote: notes.join(" "), priceComparable, targetCardId:target});
    }
    groups.get(key).offers.push(offer);
  }
  for (const group of groups.values()) {
    // Retain source order when compatibility is not established. Sorting across
    // currencies, grading companies, labels or unknown quantities suggests a
    // cheapest-card comparison that the observations cannot support.
    if (group.priceComparable && options.sort!=="source") group.offers = group.offers.map((offer, index) => ({offer, index}))
      .sort((a, b) => a.offer.price_minor - b.offer.price_minor || a.index - b.index).map(row => row.offer);
  }
  return [...groups.values()];
}

function certificateBlocksSelection(result) {
  return !!result && (result.comparison?.status === "mismatch" || ["not_found", "invalid"].includes(result.status));
}

// Informational candidate selection is allowed only inside the requested
// research context. A proven different printing must not bypass the board via
// chat, restored state or a direct handoff call.
function canSelectForTarget(offer,targetCardId,clock=Date.now(),certificateResult) {
  const target=text(targetCardId),e=offerEvidence(offer,clock);
  if(!target||target!==targetCardId||!e.canSelect||certificateBlocksSelection(certificateResult))return false;
  return (!e.cardId||e.cardId===target)&&(!e.identityEvidence?.target_card_id||e.identityEvidence.target_card_id===target);
}

// Available means a comparable current item ask, not authenticated or guaranteed.
// Candidates, missing evidence and stale observations stay in a visible review
// section. Inactive listings remain inspectable separately.
function offerSection(offer,clock=Date.now(),certificateResult,targetCardId) {
  const e=offerEvidence(offer,clock);
  if(["sold_out","unavailable","withdrawn"].includes(e.availability))return "sold";
  return e.priceComparable&&(!targetCardId||e.cardId===targetCardId)&&!certificateBlocksSelection(certificateResult)?"available":"review";
}
function comparisonSections(offers,clock=Date.now(),certificateResults={},targetCardId) {
  const sections={available:0,review:0,sold:0};
  for(const offer of listingObservations(offers).offers)sections[offerSection(offer,clock,certificateResults[offer.offer_id],targetCardId)]++;
  return sections;
}
function filterComparisonOffers(offers,options={},cardId,clock=Date.now(),certificateResults={}) {
  const section=["available","review","sold"].includes(options.section)?options.section:"all";
  const source=options.source&&options.source!=="all"?platformIdentity(options.source):null;
  const rows=listingObservations(offers).offers.filter(o=>(!source||platformIdentity(o.source)===source)&&
    (section==="all"||offerSection(o,clock,certificateResults[o.offer_id],cardId)===section));
  const groups=groupComparableOffers(rows,cardId,clock,{sort:options.sort==="price"?"price":"source"});
  const order={available:0,review:1,sold:2};
  return groups.flatMap(g=>g.offers).map((offer,index)=>({offer,index})).sort((a,b)=>
    order[offerSection(a.offer,clock,certificateResults[a.offer.offer_id],cardId)]-order[offerSection(b.offer,clock,certificateResults[b.offer.offer_id],cardId)]||a.index-b.index).map(r=>r.offer);
}
function comparableAskStats(group,clock=Date.now(),certificateResults={},targetCardId=group?.targetCardId) {
  if(!group||group.priceComparable!==true||!Array.isArray(group.offers)||!text(targetCardId)||group.targetCardId!==targetCardId)return null;
  const eligible=listingObservations(group.offers).offers.filter(o=>offerSection(o,clock,certificateResults[o.offer_id],targetCardId)==="available");
  if(eligible.some(o=>!listingKey(o)))return null;
  const target=targetCardId;
  const verified=groupComparableOffers(eligible,target,clock);
  if(verified.length!==1||!verified[0].priceComparable)return null;
  const distinct=new Map(eligible.map(o=>[listingKey(o),o]));
  // A single asking price is useful, but it is not a meaningful distribution.
  if(distinct.size<2)return null;
  const rows=[...distinct.values()],prices=rows.map(o=>o.price_minor).sort((a,b)=>a-b),middle=Math.floor(prices.length/2);
  const times=rows.map(o=>o.observed_at).sort((a,b)=>Date.parse(a)-Date.parse(b));
  return {minimum_minor:prices[0],median_minor:prices.length%2?prices[middle]:prices[middle-1]+(prices[middle]-prices[middle-1])/2,
    maximum_minor:prices.at(-1),currency:rows[0].currency,listingCount:rows.length,sellerCount:listingCoverage(rows).reportedSellerIdentities,
    oldest_observed_at:times[0],newest_observed_at:times.at(-1)};
}
module.exports = {offerEvidence, groupComparableOffers, certificateBlocksSelection, listingObservations, listingCoverage,
  offerSection,comparisonSections,filterComparisonOffers,comparableAskStats,canSelectForTarget};
