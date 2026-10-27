"use strict";
// Closed public copy of the backend BNS refusal contract. Provider-authored
// text, secret-bearing details and arbitrary variant labels fail validation.
const fail = () => { throw Error("invalid_commerce_response"); };
const object = v => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v, fields) => object(v) && Object.keys(v).length === fields.length && Object.keys(v).every(k => fields.includes(k));
const MESSAGES = {
  "invalid_request": "Buy & Ship could not accept the quote request. Check the highlighted fields.",
  "unsupported_grant_type": "Buy & Ship authentication configuration needs attention.",
  "invalid_client": "Buy & Ship client access was rejected. Check the configured credentials.",
  "server_error": "Buy & Ship could not issue an access token. Try again later.",
  "not_found": "Buy & Ship no longer recognizes this product reference. Resolve the product again.",
  "quote_expired": "The Buy & Ship quote has expired. Request a new preview.",
  "currency_unsupported": "Buy & Ship does not support the requested currency for this account.",
  "destination_unsupported": "Buy & Ship does not support this destination.",
  "variant_unavailable": "The selected Buy & Ship variant is unavailable. Review the current variants.",
  "product_not_eligible": "Buy & Ship cannot ship this product under the current restrictions.",
  "quote_limit_exceeded": "The item value exceeds the Buy & Ship quote limit.",
  "product_not_quotable": "Buy & Ship could not read enough product information to provide a quote.",
  "merchant_unreachable": "Buy & Ship could not reach the merchant. You can try a new preview later.",
  "variant_selection_required": "Choose a Buy & Ship variant before requesting a quote preview.",
  "variant_changed": "The Buy & Ship variants changed. Review them and choose again.",
  "product_mismatch": "Buy & Ship product evidence conflicts with the selected listing. No quote preview was accepted.",
  "quote_binding_invalid": "Buy & Ship returned a quote that did not match the selected product and destination.",
  "invalid_destination": "Choose Hong Kong or a supported US destination with a state code.",
  "provider_unconfigured": "Buy & Ship quote preview is not configured.",
  "provider_busy": "A Buy & Ship preview is already running. Wait before trying again.",
  "provider_timeout": "The Buy & Ship preview reached its time limit. You can try again later.",
  "provider_unavailable": "Buy & Ship quote preview is unavailable. You can try again later.",
  "invalid_provider_response": "Buy & Ship returned a response that could not be safely verified.",
  "bns_unavailable": "Buy & Ship quote preview is unavailable. You can try again later.",
  "bns_disabled": "Buy & Ship quote preview is disabled.",
  "bns_not_configured": "Buy & Ship quote preview is not configured.",
  "bns_access_rejected": "Buy & Ship access was rejected. Check the configured client access.",
  "bns_rate_limited": "Buy & Ship is limiting requests. Try a new preview later.",
  "bns_http_rejected": "Buy & Ship could not complete this preview request.",
  "bns_response_invalid": "Buy & Ship returned a response that could not be safely verified.",
  "bns_request_deadline": "The Buy & Ship preview reached its time limit. You can try again later.",
  "bns_request_budget_or_route": "The Buy & Ship preview exceeded its permitted request scope.",
  "approved_bns_endpoint_required": "An approved Buy & Ship endpoint is required.",
  "live_not_authorized": "Buy & Ship live quote preview is not authorized.",
  "single_quote_only": "Buy & Ship preview supports one item with quantity one."
};
const _REFUSED = [
  "currency_unsupported",
  "destination_unsupported",
  "invalid_destination",
  "invalid_request",
  "not_found",
  "product_mismatch",
  "product_not_eligible",
  "product_not_quotable",
  "quote_limit_exceeded",
  "variant_unavailable"
];
const _SELECTION = [
  "variant_changed",
  "variant_selection_required"
];
const _RETRYABLE = [
  "bns_rate_limited",
  "bns_request_deadline",
  "bns_unavailable",
  "merchant_unreachable",
  "provider_busy",
  "provider_timeout",
  "provider_unavailable",
  "server_error"
];
const _REASONS = {
  "product_not_eligible": [
    "CATEGORY_PROHIBITED",
    "DESTINATION_PROHIBITED",
    "MERCHANT_NOT_SUPPORTED",
    "PREORDER_NOT_SUPPORTED",
    "SELLER_BLACKLISTED",
    "UNABLE_TO_ASSESS"
  ],
  "currency_unsupported": [
    "CURRENCY_UNSUPPORTED"
  ],
  "destination_unsupported": [
    "DESTINATION_UNSUPPORTED"
  ],
  "variant_unavailable": [
    "OUT_OF_STOCK",
    "VARIANT_NOT_FOUND"
  ],
  "quote_limit_exceeded": [
    "VALUE_EXCEEDS_CEILING"
  ]
};
const _FIELDS = {
  "url": "Use a supported product URL.",
  "items": "Use one item with quantity one.",
  "items[0].reference_id": "Resolve the selected product again.",
  "items[0].variant_key": "Choose a current product variant.",
  "items[0].quantity": "Use quantity one.",
  "destination": "Choose a supported destination.",
  "destination.country": "Choose Hong Kong or the United States.",
  "destination.state": "Choose a two-letter US state code.",
  "currency": "Choose a supported account currency.",
  "client_id": "Check the configured client credentials.",
  "client_secret": "Check the configured client credentials.",
  "grant_type": "Use client credentials authentication."
};
const label = (value, max, key = false) => typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim() &&
  (key ? /^[\p{L}\p{N}._:-]+$/u : /^[\p{L}\p{N} ._:/()+%&,-]+$/u).test(value);
const money = value => exact(value, ["currency", "subunit_amount"]) && typeof value.currency === "string" && /^[A-Z]{3}$/.test(value.currency) &&
  Number.isSafeInteger(value.subunit_amount) && value.subunit_amount >= 0 && value.subunit_amount <= 10 ** 12;
function validateVariants(variants) {
  if (!Array.isArray(variants) || !variants.length || variants.length > 25 || new Set(variants.map(v => v?.variant_key)).size !== variants.length ||
    variants.some(v => !exact(v, ["variant_key", "options", "availability", "price"]) || !label(v.variant_key, 128, true) ||
      !object(v.options) || Object.keys(v.options).length > 8 || Object.entries(v.options).some(([k, value]) => !label(k, 40) || !label(value, 80)) ||
      !["in_stock", "out_of_stock", "unknown"].includes(v.availability) || !money(v.price))) fail();
  return variants;
}
function validateProviderResult(value) {
  if (!exact(value, ["schema", "status", "code", "reason_codes", "retryable", "message", "details"]) ||
    value.schema !== "pokemon.bns-refusal.v1" || typeof value.code !== "string" || !Object.hasOwn(MESSAGES, value.code) || value.message !== MESSAGES[value.code] ||
    value.status !== (_SELECTION.includes(value.code) ? "variant_selection_required" : _REFUSED.includes(value.code) ? "refused" : "unavailable") ||
    value.retryable !== _RETRYABLE.includes(value.code) || !Array.isArray(value.reason_codes) || value.reason_codes.length > 6 ||
    new Set(value.reason_codes).size !== value.reason_codes.length || value.reason_codes.some(v => !(_REASONS[value.code] || []).includes(v)) || !object(value.details)) fail();
  const d = value.details;
  if (!Object.keys(d).length) return value;
  if (["variant_unavailable", "variant_selection_required", "variant_changed"].includes(value.code) && exact(d, ["variants"])) validateVariants(d.variants);
  else if (value.code === "currency_unsupported" && exact(d, ["supported_currencies"])) {
    if (!Array.isArray(d.supported_currencies) || !d.supported_currencies.length || d.supported_currencies.length > 20 ||
      new Set(d.supported_currencies).size !== d.supported_currencies.length || d.supported_currencies.some(c => typeof c !== "string" || !/^[A-Z]{3}$/.test(c))) fail();
  } else if (value.code === "invalid_request" && exact(d, ["field_errors"])) {
    if (!Array.isArray(d.field_errors) || !d.field_errors.length || d.field_errors.length > 12 ||
      new Set(d.field_errors.map(e => e?.field)).size !== d.field_errors.length || d.field_errors.some(e =>
        !exact(e, ["field", "message"]) || typeof e.field !== "string" || !Object.hasOwn(_FIELDS, e.field) || e.message !== _FIELDS[e.field])) fail();
  } else fail();
  return value;
}
module.exports = { validateProviderResult, validateVariants, money, MESSAGES };
