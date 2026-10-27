"use strict";

const DISCLOSURE = "We may earn a commission from this link.";
const isEbay = source => ["ebay", "ebay_us"].includes(source);
const fail = () => { throw Object.assign(new Error("invalid_commerce_response"), {code:"invalid_commerce_response"}); };
const affiliateKeys = new Set(["mkevt", "mkcid", "mkrid", "campid", "toolid", "customid", "_trkparms", "_trksid", "hash"]);

function ebayItemUrl(value) {
  if (typeof value !== "string" || value.length > 4096 || !/^https:\/\/(?:www\.)?ebay\.com\//.test(value) || /[\\\s\x00-\x1f\x7f]/.test(value)) return null;
  if (value.includes("#")) return null;
  const rawPath = value.replace(/^https:\/\/[^/]+/, "").split("?")[0];
  if (!/^\/itm\/(?:[A-Za-z0-9_-]+\/)?[0-9]{8,20}$/.test(rawPath)) return null;
  try {
    const url = new URL(value);
    if (url.port || url.username || url.password || url.hash || url.pathname.includes("%")) return null;
    const match = /^\/itm\/(?:[A-Za-z0-9_-]+\/)?([0-9]{8,20})$/.exec(url.pathname);
    return match ? {url, id:match[1]} : null;
  } catch { return null; }
}

function validatePurchaseLink(offer) {
  if (offer.purchase_link === undefined) return;
  const link = offer.purchase_link, canonical = ebayItemUrl(offer.url);
  const native = typeof offer.native_id === "string" && /^v1\|([0-9]{8,20})\|0$/.exec(offer.native_id);
  if (!isEbay(offer.source) || offer.scope !== "listing" || offer.synthetic === true || !link ||
      Object.keys(link).sort().join(",") !== "disclosure,kind,url" || link.kind !== "epn_affiliate" || link.disclosure !== DISCLOSURE ||
      !canonical || !native || offer.url !== `https://www.ebay.com/itm/${native[1]}` || canonical.id !== native[1]) fail();
  const affiliate = ebayItemUrl(link.url);
  if (!affiliate || affiliate.id !== canonical.id) fail();
  const params = affiliate.url.searchParams, seen = new Set();
  for (const [key,value] of params) {
    if (!affiliateKeys.has(key) || seen.has(key) || !value || value.length > 1024 || /[\x00-\x1f\x7f]/.test(value)) fail();
    seen.add(key);
  }
  if (!/^[0-9]{10}$/.test(params.get("campid") || "") || params.get("mkevt") !== "1" || params.get("mkcid") !== "1" ||
      !/^[0-9]{1,5}$/.test(params.get("toolid") || "") ||
      params.has("customid") && !/^[A-Za-z0-9_-]{1,64}$/.test(params.get("customid"))) fail();
}

// Display helpers also fail closed when rendered independently of the transport.
function purchaseDestination(offer) {
  if (!isEbay(offer?.source) || offer.synthetic === true) return null;
  try { validatePurchaseLink(offer); } catch { return null; }
  const canonical = ebayItemUrl(offer.url);
  if (!canonical) return null;
  return {url:offer.purchase_link?.url || offer.url, affiliate:!!offer.purchase_link,
    disclosure:offer.purchase_link ? DISCLOSURE : null};
}

function validateMarketplaceConnections(value) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 2) fail();
  const seen = new Set();
  for (const connection of value) {
    if (!connection || Object.keys(connection).sort().join(",") !== "message,source,status" ||
        !["ebay_us", "fanatics_collect"].includes(connection.source) || seen.has(connection.source) ||
        !["not_configured", "configured_offline", "enabled"].includes(connection.status) ||
        typeof connection.message !== "string" || !connection.message.trim() || connection.message.length > 500) fail();
    seen.add(connection.source);
  }
}

module.exports = {DISCLOSURE, isEbay, validatePurchaseLink, purchaseDestination, validateMarketplaceConnections};
