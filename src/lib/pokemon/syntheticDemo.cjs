"use strict";
// Explicit, local-only walkthrough. Never selected after a live failure.
function syntheticEnabled(env = process.env) {
  return env.POKEMON_CREATOR_SYNTHETIC_DEMO === "true" && !env.K_SERVICE &&
    (env.POKEMON_CREATOR_STATE_DRIVER || "local") === "local";
}
function manualResearchEnabled(env = process.env) {
  return env.POKEMON_CREATOR_MANUAL_RESEARCH === "true" && !env.K_SERVICE &&
    (env.POKEMON_CREATOR_STATE_DRIVER || "local") === "local" && !syntheticEnabled(env);
}
function localEmptyList(operation,value,env=process.env){
  return manualResearchEnabled(env)&&["chat-list","bookmark-list","collection-list","alert-list"].includes(operation)&&Array.isArray(value)&&value.length===0;
}
const CARD_ID = "ja:SV2A:173/165:standard";
const card = {
  card_id: CARD_ID, name: "Pikachu · synthetic example", language: "ja",
  set_code: "SV2A", collector_number: "173/165", variant: "standard", rarity: "AR",
  provenance: "Synthetic demo data. No live catalog or artwork evidence.",
};
function detail(id) {
  if (id !== CARD_ID) throw Object.assign(new Error("catalog_record_unavailable"), { code: "catalog_record_unavailable" });
  return { card: { ...card }, set: { name: "Pokémon Card 151 · demo", release_date: "2023-06-16" },
    discovery_facets: [], source_image_facts: null, number_context: {}, media_evidence: null,
    source_scan_hold: false, data_source: "synthetic_demo", backend: "Synthetic demo" };
}
function createSyntheticCatalog() {
  return {
    async status() { return { records: 1, languages: { ja: 1, en: 0 }, source_image_evidence: null,
      source_scan_coverage: null, catalog_source_image_coverage: null, data_source: "synthetic_demo", backend: "Synthetic demo" }; },
    async search(p) {
      if (typeof p?.q !== "string" || !p.q.trim() || p.q.length > 200 || !Number.isInteger(p.offset) || p.offset < 0)
        throw Object.assign(new Error("invalid_catalog_request"), { code: "invalid_catalog_request" });
      return { cards: p.offset ? [] : [{ ...card }], total: 1, offset: p.offset, query: p.q,
        data_source: "synthetic_demo", backend: "Synthetic demo" };
    },
    async card(id) { return detail(id); },
    async cards(ids) { if (!Array.isArray(ids) || ids.length > 100) throw Error("invalid_catalog_request");
      return { schema: "pokemon.live-card-details.v1", cards: ids.map(detail) }; },
    async market() { throw Object.assign(new Error("catalog_market_display_denied"), { code: "catalog_market_display_denied" }); },
    async validateFamilyPresentation(value) { return value; },
  };
}
module.exports = { syntheticEnabled, manualResearchEnabled, localEmptyList, createSyntheticCatalog, CARD_ID };
