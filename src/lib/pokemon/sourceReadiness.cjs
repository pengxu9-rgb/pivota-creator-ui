"use strict";

const SOURCES = ["ebay_us", "mercari", "snkrdunk"];
const BLOCKERS = ["source_access_required", "source_disabled", "source_revoked", "source_window_closed", "source_adapter_unavailable"];
const sourceId = source => source === "ebay" ? "ebay_us" : source;
const fail = () => { throw Object.assign(new Error("invalid_commerce_response"), {code:"invalid_commerce_response"}); };
const fields = "blocker,listing_read_enabled,message,method,photo_display,source,status";
function validateSourceReadiness(value, offers = [], mode = "on_demand_research") {
  // Older producers do not report this capability. Absence is never presented
  // as proof of a configured or enabled live source.
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length !== SOURCES.length) fail();
  const seen = new Set();
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).sort().join(",") !== fields ||
        !SOURCES.includes(row.source) || seen.has(row.source) ||
        !["not_configured", "configured_offline", "enabled"].includes(row.status) ||
        !["api", "crawl", "none"].includes(row.method) || typeof row.listing_read_enabled !== "boolean" ||
        !["not_approved", "authorized_only"].includes(row.photo_display) ||
        typeof row.message !== "string" || !row.message.trim() || row.message.length > 500 || /[\x00-\x1f\x7f]/.test(row.message) ||
        !(row.blocker === null || BLOCKERS.includes(row.blocker))) fail();
    const enabled = row.status === "enabled";
    if (enabled !== row.listing_read_enabled || enabled !== (row.blocker === null) ||
        enabled && row.method === "none" || row.status === "not_configured" && row.method !== "none" ||
        (row.status === "not_configured" || row.blocker === "source_revoked") && row.photo_display !== "not_approved") fail();
    seen.add(row.source);
  }
  if (mode !== "synthetic_fixture") for (const offer of offers) {
    const row = value.find(r => r.source === sourceId(offer.source));
    if (!row || offer.listing_photos?.length && row.photo_display !== "authorized_only") fail();
  }
}

const sourceLabel = source => ({ebay_us:"eBay", mercari:"Mercari", snkrdunk:"SNKRDUNK"}[sourceId(source)] || "Marketplace");
const blockerLabel = code => ({
  source_access_required:"Approved source access is needed before listing checks can run.",
  source_disabled:"Listing checks are switched off for this source.",
  source_revoked:"Source access was withdrawn. Earlier offers need a new check.",
  source_window_closed:"The approved source access window ended or its request allowance was reached.",
  source_adapter_unavailable:"This source connection is unavailable. No current result is confirmed.",
}[code] || "Source readiness has not been reported. A connection does not confirm available inventory.");

function sourceReadinessView(research, browsingBeta = false) {
  if (browsingBeta) return {kind:"blocked", title:"Seller offers are not enabled in this beta", message:"You can explore catalog cards and save a shortlist. Live seller listings, certificate lookups and BNS quotes are switched off in this browsing beta.", sources:[], live:false};
  try { validateSourceReadiness(research?.source_readiness, research?.offers, research?.mode); }
  catch { return {kind:"blocked", title:"Source status could not be confirmed", message:"Refresh the listing check before continuing. No source access or current offer is established.", sources:[], live:false}; }
  if (research?.mode === "synthetic_fixture") return {kind:"example", title:"Offline journey example", message:"These are synthetic inputs. No marketplace or buying service was contacted.", sources:[], live:false};
  const rows = research?.source_readiness;
  if (!rows) return {kind:"unknown", title:"Live source access has not been confirmed", message:"Approved listing access and permission to display seller photos are needed. Catalog coverage does not establish live seller inventory.", sources:[], live:false};
  const live = rows.some(row => row.listing_read_enabled);
  return {kind:live?"enabled":"blocked", title:live?"Source access for this check":"Listing checks are not active", message:live?"Enabled means listing reads are allowed for this check. It does not guarantee stock, card authenticity or whole-market coverage.":"No listing source is enabled. An approved connection is needed before a live offer check can run.", live,
    sources:rows.map(row => ({source:row.source, label:sourceLabel(row.source), status:row.status === "enabled" ? "Listing reads enabled" : row.status === "configured_offline" ? "Configured · listing reads off" : "Not connected", method:row.method === "api" ? "API" : row.method === "crawl" ? "Crawl adapter" : "No active method", photos:row.photo_display === "authorized_only" ? "Authorized listing photos only" : "Seller photo display not approved", message:row.blocker === null ? "Availability and price still require a fresh exact-listing check." : blockerLabel(row.blocker)}))};
}

// Independent rendering must respect photo permission too, even if a caller
// bypasses the normal response validator. Legacy producers keep their existing
// bounded listing-photo validation; permission is still required for display.
function sourceReadAllowed(research, source) {
  if (research?.mode === "synthetic_fixture") return true;
  if (research?.source_readiness === undefined) return false;
  try { validateSourceReadiness(research.source_readiness); } catch { return false; }
  return research.source_readiness.some(row => row.source === sourceId(source) && row.listing_read_enabled);
}
function photosAllowed(research, source) {
  if (research?.source_readiness === undefined) return false;
  try { validateSourceReadiness(research.source_readiness); } catch { return false; }
  return research.source_readiness.some(row => row.source === sourceId(source) && row.photo_display === "authorized_only");
}
module.exports = {validateSourceReadiness, sourceReadinessView, photosAllowed, sourceReadAllowed};
