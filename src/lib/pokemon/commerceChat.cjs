"use strict";
// Interpret only bounded commerce actions. Catalog identity always comes from an explicit card choice.
const SUPPORTED = /https:\/\/(?:jp\.mercari\.com|(?:www\.)?ebay\.com|(?:www\.)?snkrdunk\.com)\/[^\s<>]+/gi;
function commerceIntent(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) return null;
  const text = value.normalize("NFKC").trim();
  const grades=[...text.matchAll(/\b(PSA|BGS|CGC|ARS|PGC)\s*(\d+(?:\.\d+)?)/gi)];
  if(grades.some(m=>m[1].toUpperCase()!=="PSA")||new Set(grades.map(m=>m[1].toUpperCase()+":"+m[2])).size>1)return null;
  // Free-form exclusions and competing grade requirements belong to the catalog agent.
  const instruction=text.replace(/\b(cert(?:ificate)?)\s+no\.?\s*(?=[:#-]?\s*\d)/gi,'$1 number ');
  if (/\b(?:not|no|except|avoid|exclude|without|never|instead|rather|don[’']t|do not)\b|不要|不是|排除|除外|ではない|말고|제외/i.test(instruction) || new Set([...text.matchAll(/\bPSA\s*(\d+(?:\.\d+)?)/gi)].map(m=>m[1])).size > 1 || /\bPSA\s*\d+\s*(?:or|vs\.?|versus|\/)\s*(?:PSA\s*)?\d+/i.test(text)) return null;
  const cert = text.match(/\b(?:PSA\s*(?:cert(?:ificate)?\s*(?:number|no\.?|#)?|lookup|check)|cert(?:ificate)?\s*(?:number|no\.?|#)?)\s*[:#-]?\s*(\d{1,20})\b/i);
  if (cert) return { kind: "psa", certificate_number: cert[1] };
  const variant = text.match(/^(?:choose|select|pick)\s+variant\s*#?(\d{1,2})[.!]?$/i);
  if (variant) return { kind: "variant", index: Number(variant[1]) - 1 };
  const select = text.match(/^(?:choose|select|pick)(?:\s+(?:offer|listing|option))?\s*#?(\d{1,2})[.!]?$/i);
  if (select) return { kind: "select", index: Number(select[1]) - 1 };
  const urls = text.match(SUPPORTED) || [];
  if (/\b(?:quote|forward(?:er|ing)?|handoff|ship(?:ping)?)\b/i.test(text) && !urls.length && !/\b(?:find|search|research|offers|listings)\b/i.test(text)) {
    const country = /\b(?:hong kong|HK)\b/i.test(text) ? "HK" : /\b(?:united states|USA|US)\b/i.test(text) ? "US" : /\b(?:singapore|SG)\b/i.test(text) ? "SG" : /\b(?:south korea|korea|KR)\b/i.test(text) ? "KR" : /\b(?:japan|JP)\b/i.test(text) ? "JP" : /\b(?:united kingdom|UK|GB)\b/i.test(text) ? "GB" : null;
    const state = text.match(/\b(?:state|region)\s*[:=]?\s*([A-Za-z]{2})\b/i)?.[1]?.toUpperCase() || null;
    return { kind: "handoff", country, state };
  }
  if (urls.length || /\b(?:price|prices|pricing|offers?|listings?|buy|purchase|mercari|ebay|snkrdunk|refresh)\b|\bPSA\s*\d+/i.test(text)) return { kind: "research", text, product_urls: urls };
  return null;
}
function catalogQuery(text) {
  return String(text).replace(SUPPORTED, " ").replace(/\bPSA\s*\d+(?:\.\d+)?\b/gi, " ")
    .replace(/\b(?:please|can|could|would|you|me|my|find|search|research|show|compare|best|current|live|real|time|price|prices|pricing|offers?|listings?|buy|purchase|mercari|ebay|snkrdunk|for|on|across|the|a|an|and|from)\b/gi, " ")
    .replace(/\s+/g, " ").trim().slice(0, 240);
}
function cardResearchQuery(card, text = "") {
  const grade = String(text).match(/\bPSA\s*(\d+(?:\.\d+)?)\b/i);
  return [card.name.replace(" · synthetic example", ""), card.collector_number, grade ? "PSA " + grade[1] : ""].filter(Boolean).join(" ").slice(0, 240);
}
module.exports = { commerceIntent, catalogQuery, cardResearchQuery };
