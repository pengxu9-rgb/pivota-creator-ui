"use strict";
const {MESSAGES}=require("../src/lib/pokemon/bnsPreview.cjs");
const money = (subunit_amount = 2000, currency = "JPY") => ({ currency, subunit_amount });
const variants = () => [
  { variant_key: "sku-1", options: { condition: "PSA 10 seller claim" }, availability: "in_stock", price: money() },
  { variant_key: "sku-2", options: { condition: "Ungraded" }, availability: "out_of_stock", price: money(1000) },
];
const refusal = (code = "variant_selection_required", details = { variants: variants() }) => ({ schema: "pokemon.bns-refusal.v1",
  status: ["variant_selection_required", "variant_changed"].includes(code) ? "variant_selection_required" :
    ["variant_unavailable", "currency_unsupported", "invalid_request", "product_not_eligible"].includes(code) ? "refused" : "unavailable",
  code, reason_codes: [], retryable: code === "merchant_unreachable", message: MESSAGES[code], details });
const productUrl = "https://jp.mercari.com/item/m12345678901";
const handoff = () => ({ schema: "pokemon.agent-commerce.v1", mode: "on_demand_research", status: "variant_selection_required",
  product_url: productUrl, forwarder: { id: "buyship", label: "Buy & Ship" }, message: "Review exact provider variants",
  quote: null, purchasable: false, purchase_action: null, order_created: false, provider_result: refusal() });
const preview = () => {
  const h = handoff(); delete h.provider_result; h.status = "quote_ready_for_review";
  h.quote = { status: "quote_ready_for_review", purchasable: false, purchase_action: null, order_created: false,
    card_id: "ja:SV2A:173/165:holo", listing: { source: "mercari", native_id: "m12345678901", url: productUrl,
      title: "Pikachu 173/165 PSA10", observed_at: "2026-10-22T01:00:00Z", ask: money(),
      grade: { company: "PSA", value: "10", certificate_verified: false }, identity_status: "unverified_candidate" },
    buyship: { reference_id: "server-held-reference", variant_key: "sku-1", canonical_url: productUrl,
      merchant_domain: "jp.mercari.com", resolve_price: money(2100), resolve_price_differs_from_observation: true,
      quote_id: "provider-quote", quoted_at: "2026-10-22T01:00:01Z", expires_at: "2026-10-22T01:15:01Z",
      destination: { country: "HK" }, currency: "HKD", unit_price: money(12000, "HKD"),
      components: { items: money(12000, "HKD"), bns_service_fee: money(1000, "HKD"), local_shipping: money(0, "HKD"), international_shipping: money(0, "HKD"), duties: money(0, "HKD") }, grand_total: money(13000, "HKD"),
      variant_options: { condition: "PSA 10 seller claim" }, resolved_availability: "in_stock" },
    evidence: { schema: "pokemon.bns-url-preview-evidence.v1", mode: "url_quote_preview", identity_status: "unverified_candidate",
      certificate_verified: false, authenticity_verified: false, selected_offer_sha256: "1".repeat(64), resolve_response_sha256: "2".repeat(64),
      quote_response_sha256: "3".repeat(64), binding_sha256: "4".repeat(64),
      binding_scope: "selected marketplace URL and BNS reference/variant only; catalog identity and seller grade remain unverified" } };
  return h;
};

// Success-flow fixtures report available stock and a bounded freshness window;
// unknown stock/freshness has separate refusal coverage and is not selectable.
const offer=()=>({offer_id:'offer-1',source:'mercari',native_id:'m12345678901',title:'Pikachu 173/165 PSA10',url:productUrl,price_minor:2000,currency:'JPY',availability:'available',observed_at:'2026-10-22T01:00:00Z',fresh_until:'2026-10-22T01:30:00Z',scope:'listing',identity_status:'unverified_candidate',grade:{company:'PSA',value:'10',certificate_verified:false}});
const research=()=>({schema:'pokemon.agent-commerce.v1',mode:'on_demand_research',card_id:'ja:SV2A:173/165:holo',checked_at:'2026-10-22T01:00:00Z',platforms:[{source:'mercari',status:'ok',message:'Public source observation'}],offers:[offer()],forwarders:[{id:'buyship',label:'Buy & Ship',quote_available:true,manual_handoff_available:true}]});
const selection=()=>({schema:'pokemon.agent-commerce.v1',mode:'on_demand_research',selection_id:'server-selection-one',expires_at:'2026-10-22T01:30:00Z',offer:offer()});
module.exports={money,variants,refusal,productUrl,handoff,preview,offer,research,selection};
