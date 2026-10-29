"use strict";
const { validateProviderResult } = require("./bnsPreview.cjs");
// A choice belongs to one owner-held selection, buying path, destination and
// exact displayed variant list. It never carries provider reference IDs/prices
// into a request, and it never initiates a request.
const variantScope = (selection, forwarder, country, state = "") => JSON.stringify([selection, forwarder, country, country === "US" ? state : ""]);
function variants(result) {
  if (!result) return [];
  validateProviderResult(result);
  return result.details.variants || [];
}
function chooseVariant(result, index, scope) {
  const list = variants(result), chosen = list[index];
  return chosen?.availability === "in_stock" ? { scope, variant_key: chosen.variant_key, displayed: JSON.stringify(list) } : null;
}
function variantKeyFor(result, choice, scope) {
  if (!choice || choice.scope !== scope) return undefined;
  const list = variants(result);
  return choice.displayed === JSON.stringify(list) && list.some(v => v.variant_key === choice.variant_key && v.availability === "in_stock") ? choice.variant_key : undefined;
}
module.exports = { variantScope, chooseVariant, variantKeyFor };
