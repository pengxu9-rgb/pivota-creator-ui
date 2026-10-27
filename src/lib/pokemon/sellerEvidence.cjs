"use strict";

const fail = () => { throw Object.assign(new Error("invalid_commerce_response"), {code: "invalid_commerce_response"}); };
const boundedText = (value, max) => typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
const instant = value => {
  if (typeof value !== "string" || value.length > 40) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  return !!m && Number(m[1]) >= 1 && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[3]) >= 1 &&
    Number(m[3]) <= new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate() && Number(m[4]) <= 23 && Number(m[5]) <= 59 && Number(m[6]) <= 59 &&
    (m[8] === "Z" || Number(m[9]) <= 23 && Number(m[10]) <= 59) && Number.isFinite(Date.parse(value));
};
const instantMicros = value => BigInt(Date.parse(value)) * 1000n + BigInt((/\.(\d{1,6})(?:Z|[+-]\d{2}:\d{2})$/.exec(value)?.[1] || "").padEnd(6, "0").slice(3));
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const count = value => Number.isSafeInteger(value) && value >= 0;
const finite = value => typeof value === "number" && Number.isFinite(value);
const platformIdentity = source => source === "ebay" ? "ebay_us" : source;
const platformNames = {mercari: ["mercari", "メルカリ"], ebay_us: ["ebay"], snkrdunk: ["snkrdunk", "スニダン"]};
const platformOnly = (seller, source) => seller.url === null && [seller.id, seller.display_name].some(value =>
  typeof value === "string" && platformNames[platformIdentity(source)]?.includes(value.normalize("NFKC").toLowerCase()));

function sellerProfileUrl(value, source) {
  if (!boundedText(value, 2048)) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.port && u.port !== "443" || u.pathname.includes("%")) return null;
    const allowed = source === "mercari" ? u.hostname === "jp.mercari.com" && /^\/user\/profile\/[A-Za-z0-9_-]+\/?$/.test(u.pathname) :
      ["ebay_us", "ebay"].includes(source) ? ["ebay.com", "www.ebay.com"].includes(u.hostname) && /^\/(?:usr|str)\/[A-Za-z0-9_][A-Za-z0-9_.-]*\/?$/.test(u.pathname) :
      source === "snkrdunk" ? ["snkrdunk.com", "www.snkrdunk.com"].includes(u.hostname) && /^\/users\/[A-Za-z0-9_-]+\/?$/.test(u.pathname) : false;
    return allowed ? value : null;
  } catch { return null; }
}

function validateSeller(seller, source, observedAt) {
  if (seller == null) return seller;
  if (!exact(seller, ["id", "display_name", "url", "evidence_ref", "observed_at", "reputation"]) ||
      !(seller.id === null || boundedText(seller.id, 128)) ||
      !(seller.display_name === null || boundedText(seller.display_name, 160)) ||
      !(seller.url === null || sellerProfileUrl(seller.url, source)) ||
      ![seller.id, seller.display_name, seller.url].some(value => value !== null) ||
      platformOnly(seller, source) ||
      !boundedText(seller.evidence_ref, 2048) || !instant(seller.observed_at) ||
      !instant(observedAt) || instantMicros(seller.observed_at) > instantMicros(observedAt)) fail();
  const r = seller.reputation;
  if (r === null) return seller;
  if (!exact(r, ["rating", "review_count", "positive_feedback_percent", "feedback_score", "evidence_ref", "observed_at"]) ||
      !(r.review_count === null || count(r.review_count)) || !(r.feedback_score === null || count(r.feedback_score)) ||
      !(r.positive_feedback_percent === null || finite(r.positive_feedback_percent) && r.positive_feedback_percent >= 0 && r.positive_feedback_percent <= 100) ||
      !boundedText(r.evidence_ref, 2048) || !instant(r.observed_at) || instantMicros(r.observed_at) > instantMicros(seller.observed_at) ||
      [r.rating, r.review_count, r.positive_feedback_percent, r.feedback_score].every(value => value === null)) fail();
  if (r.rating !== null && (!exact(r.rating, ["value", "scale"]) || !finite(r.rating.value) || !finite(r.rating.scale) ||
      r.rating.scale <= 0 || r.rating.scale > 1000 || r.rating.value < 0 || r.rating.value > r.rating.scale)) fail();
  return seller;
}

// Seller identity is platform scoped. A display name alone cannot establish a
// distinct seller, and neither a rating nor a platform's name supplies an ID.
function sellerIdentityTuple(offer) {
  const seller = offer?.seller;
  return [seller?.id ?? null, seller?.display_name ?? null, seller?.url ?? null];
}

function sellerView(offer) {
  let seller = offer?.scope === "listing" ? offer.seller ?? null : null;
  try { validateSeller(seller, offer?.source, offer?.observed_at); } catch { seller = null; }
  if (!seller) return {reported: false, label: "Seller not reported", profileUrl: null, identityKey: null,
    reputationLines: [], reputationLabel: "Seller reputation not reported", observedAt: null, evidenceRef: null, reputationObservedAt: null, reputationEvidenceRef: null};
  const r = seller.reputation, lines = [];
  if (r?.rating) lines.push(`Rating ${r.rating.value} / ${r.rating.scale}`);
  if (r?.review_count !== null && r?.review_count !== undefined) lines.push(`${r.review_count} ${r.review_count === 1 ? "review" : "reviews"}`);
  if (r?.positive_feedback_percent !== null && r?.positive_feedback_percent !== undefined) lines.push(`${r.positive_feedback_percent}% positive feedback`);
  if (r?.feedback_score !== null && r?.feedback_score !== undefined) lines.push(`Feedback score ${r.feedback_score}`);
  return {reported: true, label: seller.display_name || (seller.id ? `Seller ${seller.id}` : "Seller profile reported"),
    profileUrl: seller.url, identityKey: seller.id ? JSON.stringify([platformIdentity(offer.source), "id", seller.id]) : seller.url ? JSON.stringify([platformIdentity(offer.source), "profile", seller.url]) : null,
    reputationLines: lines, reputationLabel: lines.length ? lines.join(" · ") : "Seller reputation not reported",
    observedAt: seller.observed_at, evidenceRef: seller.evidence_ref,
    reputationObservedAt: r?.observed_at ?? null, reputationEvidenceRef: r?.evidence_ref ?? null};
}

module.exports = {validateSeller, sellerProfileUrl, sellerView, sellerIdentityTuple, platformIdentity};
