"use strict";
const { validWarnings } = require("./mediaWarnings.cjs");
// Backend evidence metadata is never a substitute for image delivery or identity.
const fail = () => {
  throw Object.assign(new Error("invalid_live_catalog_response"), {
    code: "invalid_live_catalog_response",
  });
};
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const text = (v, max = 2000) =>
  typeof v === "string" && !!v.trim() && v.length <= max;
const sha = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const https = (v) => {
  try {
    const u = new URL(v);
    return text(v) && u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
const endpointFields = [
  "card_id", "language", "set_code", "collector_number", "variant", "name",
  "rarity", "provenance", "match_eligible", "display_allowed", "rights_reference",
];
const falseAuthority = [
  "physical_printing_verified", "price_comparable", "automatic_offer_join_allowed",
  "display_allowed",
];
const referenceFalseAuthority = [
  ...falseAuthority, "catalog_identity_confirmed", "public_display_allowed",
  "exact_variant_verified", "image_review_complete", "source_access_approved",
  "source_response_authenticated",
];
const coordinate = (value) => typeof value === "string" && value.length <= 240 && /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)*$/.test(value);
const sameNumber = (a, b) => typeof a === "string" && typeof b === "string" &&
  (a.toLowerCase() === b.toLowerCase() || (/^[0-9]+$/.test(a) && /^[0-9]+$/.test(b) && BigInt(a) === BigInt(b)));
// The authenticated backend preserves the raw rarity used by image identity
// while presenting qualified official rarity metadata. No other field projects.
const officialIconRarities = {
  "ic_rare_ar.gif": "AR", "ic_rare_sr_c.gif": "SR", "ic_rare_sar.gif": "SAR",
  "ic_rare_MUR.gif": "MUR", "ic_rare_s_2.gif": "S", "ic_rare_ssr.gif": "SSR",
  "ic_rare_ur_c.gif": "UR", "ic_rare_hr.gif": "HR", "ic_rare_chr.gif": "CHR",
  "ic_rare_csr.gif": "CSR", "ic_rare_c_c.gif": "C", "ic_rare_u_c.gif": "U",
  "ic_rare_r_c.gif": "R", "ic_rare_rr.gif": "RR", "ic_rare_bwr.gif": "BWR",
};
// Type vocabulary from pinned TCGDex interfaces; no card or alternate-source values.
const providerRarities = new Set(["ACE SPEC Rare", "Amazing Rare", "Black White Rare", "Character Rare", "Character Super Rare", "Classic Collection", "Common", "Crown", "Double rare", "Four Diamond", "Full Art Trainer", "Futuristic Rare", "Holo Rare", "Holo Rare V", "Holo Rare VMAX", "Holo Rare VSTAR", "Hyper rare", "Illustration rare", "LEGEND", "Mega Attack Rare", "Mega Hyper Rare", "None", "One Diamond", "One Shiny", "One Star", "Pikachu Rare", "Prism Star", "Promo", "RGB Rare", "Radiant Rare", "Rare", "Rare Holo", "Rare Holo LV.X", "Rare PRIME", "Secret Rare", "Shiny Ultra Rare", "Shiny rare", "Shiny rare V", "Shiny rare VMAX", "Special illustration rare", "Three Diamond", "Three Star", "Triple Rare", "Two Diamond", "Two Shiny", "Two Star", "Ultra Rare", "Uncommon"]);
const providerFalseAuthority = [
  "physical_finish_verified", "listing_copy_verified", "price_comparable",
  "automatic_offer_join_allowed", "display_allowed", "public_display_allowed",
  "source_access_approved", "matching_enable_allowed", "raw_rarity_overwrite_allowed",
];
function providerCardDetails(details) {
  const categories = new Set(["Pokemon", "Trainer", "Energy"]);
  const types = new Set(["Colorless", "Darkness", "Dragon", "Fairy", "Fighting", "Fire", "Grass", "Lightning", "Metal", "Psychic", "Water"]);
  const stages = new Set(["Basic", "BREAK", "LEVEL-UP", "MEGA", "RESTORED", "Stage1", "Stage2", "VMAX", "V-UNION", "Baby", "VSTAR"]);
  if (!object(details) || Object.keys(details).sort().join() !== ["category", "hp", "types", "stage", "stage_source_literal", "field_statuses"].sort().join() ||
    !(details.category === null || categories.has(details.category)) ||
    !(details.stage_source_literal === null || stages.has(details.stage_source_literal)) || !object(details.field_statuses) ||
    Object.keys(details.field_statuses).sort().join() !== ["category", "hp", "types", "stage"].sort().join()) fail();
  if (details.category === null && details.stage_source_literal !== null) fail();
  const pokemon = details.category === "Pokemon";
  if (pokemon) {
    if (!(details.hp === null || Number.isSafeInteger(details.hp) && details.hp >= 1 && details.hp <= 10000) ||
      !(details.types === null || Array.isArray(details.types) && details.types.length >= 1 && details.types.length <= 4 &&
        details.types.every(type => types.has(type)) && new Set(details.types).size === details.types.length) ||
      details.stage !== details.stage_source_literal) fail();
  } else if (details.hp !== null || details.types !== null || details.stage !== null) fail();
  if (details.field_statuses.category !== (details.category === null ? "not_declared" : "source_declared")) fail();
  for (const field of ["hp", "types", "stage"]) {
    const expected = details[field] !== null ? "source_declared" : (pokemon || details.category === null ? "not_declared" : "not_applicable");
    if (details.field_statuses[field] !== expected) fail();
  }
  return details;
}
function providerMetadata(value, card, digest) {
  if (!object(value) || !["pokemon.provider-card-metadata-context.v1", "pokemon.provider-card-metadata-context.v2"].includes(value.schema) ||
    value.status !== "provider_native_metadata_supported" ||
    !/^provider-metadata:[a-f0-9]{64}$/.test(value.evidence_id || "") ||
    providerFalseAuthority.some(key => value[key] !== false) ||
    card.language !== "en" || card.variant !== "unverified_api_family" ||
    card.match_eligible !== 0 || card.display_allowed !== 0 ||
    !object(value.identity) || !sha(value.identity_sha256) || typeof digest !== "function" ||
    digest(value.identity) !== value.identity_sha256 || !object(value.source) || !object(value.provider)) fail();
  const identity = value.identity, source = value.source, fields = value.provider;
  const rawKeys = [...endpointFields, "attributes_json"].sort();
  if (Object.keys(identity).sort().join() !== rawKeys.join() || identity.rarity !== null ||
    endpointFields.filter(key => key !== "rarity").some(key => identity[key] !== card[key]) ||
    typeof identity.attributes_json !== "string") fail();
  let attributes;
  try { attributes = JSON.parse(identity.attributes_json); } catch { fail(); }
  if (!object(attributes) || !object(card.attributes) || digest(attributes) !== digest(card.attributes) ||
    attributes.printing_variant_unresolved !== true || !Array.isArray(attributes.source_card_ids) ||
    attributes.source_card_ids.length !== 1 || !/^[A-Za-z0-9_.!%?-]{1,100}$/.test(attributes.source_card_ids[0] || "")) fail();
  const native = attributes.source_card_ids[0];
  const encoded = encodeURIComponent(native).replace(/[!'()*]/g, character => "%" + character.charCodeAt(0).toString(16).toUpperCase());
  const url = "https://api.tcgdex.net/v2/en/cards/" + encoded;
  if (Object.keys(source).sort().join() !== ["provider", "native_card_id", "url", "sha256", "bytes", "fetched_at", "provenance", "receipt_sha256"].sort().join() ||
    source.provider !== "tcgdex" || source.native_card_id !== native || source.url !== url ||
    !sha(source.sha256) || !sha(source.receipt_sha256) ||
    !Number.isSafeInteger(source.bytes) || source.bytes < 1 || source.bytes > 2097152 ||
    !text(source.fetched_at) || !Number.isFinite(Date.parse(source.fetched_at)) ||
    source.provenance !== "tcgdex-card-detail:" + native + ":sha256:" + source.sha256 ||
    !/^tcgdex-api:v2:en:sets\/[A-Za-z0-9_.-]+:sha256:[a-f0-9]{64}$/.test(identity.provenance)) fail();
  if (Object.keys(fields).sort().join() !== ["illustrator", "rarity", "illustrator_status", "rarity_status", ...(value.schema === "pokemon.provider-card-metadata-context.v2" ? ["card_details"] : [])].sort().join() ||
    !(fields.illustrator === null || text(fields.illustrator, 160)) ||
    !(fields.rarity === null || providerRarities.has(fields.rarity)) ||
    fields.illustrator !== null && (fields.illustrator !== fields.illustrator.trim() || /[\u0000-\u001f]/.test(fields.illustrator) || ["unknown", "none", "null", "n/a", "na", "not available", "not declared", "?", "-"].includes(fields.illustrator.toLowerCase())) ||
    fields.illustrator_status !== (fields.illustrator === null ? "not_declared" : "source_declared") ||
    fields.rarity_status !== (fields.rarity === "None" ? "provider_declared_none" : fields.rarity === null ? "not_declared" : "source_declared") ||
    fields.illustrator === null && fields.rarity === null && value.schema !== "pokemon.provider-card-metadata-context.v2") fail();
  if (value.schema === "pokemon.provider-card-metadata-context.v2") {
    const details = providerCardDetails(fields.card_details);
    if (fields.illustrator === null && fields.rarity === null && !Object.values(details.field_statuses).includes("source_declared")) fail();
  }
  if (card.rarity !== fields.rarity) fail();
  return value;
}
const pinnedPublisherFalseClaims = ["fresh_source_fetch_claimed", "physical_finish_verified", "listing_copy_verified", "price_comparable", "automatic_offer_join_allowed", "display_allowed", "public_display_allowed", "source_access_approved", "matching_enable_allowed", "raw_metadata_overwrite_allowed"];
function pinnedPublisherMetadata(value, card, digest) {
  if (!object(value) || value.schema !== "pokemon.pinned-publisher-metadata.v1" || value.status !== "pinned_publisher_metadata_supported" ||
    !/^pinned-ptcg-metadata:[a-f0-9]{64}$/.test(value.evidence_id || "") || pinnedPublisherFalseClaims.some(key => value[key] !== false) ||
    card.language !== "ja" || typeof digest !== "function" || !object(value.identity) || !sha(value.identity_sha256) ||
    digest(value.identity) !== value.identity_sha256 || !object(value.reference) || !sha(value.reference_sha256) ||
    digest(value.reference) !== value.reference_sha256 || !object(value.source) || !object(value.publisher) ||
    card.official_metadata != null || card.provider_metadata != null) fail();
  const raw = value.identity, source = value.source, ref = value.reference, facts = value.publisher;
  if (Object.keys(raw).sort().join() !== [...endpointFields, "attributes_json"].sort().join() ||
    endpointFields.filter(key => key !== "rarity").some(key => raw[key] !== card[key]) ||
    !(raw.rarity === null || text(raw.rarity)) || typeof raw.attributes_json !== "string") fail();
  let attributes, refAttributes;
  try { attributes = JSON.parse(raw.attributes_json); refAttributes = JSON.parse(ref.attributes_json); } catch { fail(); }
  if (!object(attributes) || !object(refAttributes) || !object(card.attributes) || digest(attributes) !== digest(card.attributes)) fail();
  const revision = "bc5a2698eb9af858feb0280d579fd5fd0f0273e2";
  if (Object.keys(source).sort().join() !== ["provider", "revision", "native_id", "relative_path", "sha256", "bytes", "provenance", "declared_card_url", "registry_sha256"].sort().join() ||
    source.provider !== "ptcg-database" || source.revision !== revision || !/^[0-9]{1,6}$/.test(source.native_id || "") ||
    !sha(source.sha256) || !Number.isSafeInteger(source.bytes) || source.bytes < 1 || source.bytes > 2097152 ||
    source.registry_sha256 !== "dd207a5afbd44c7c2b8c8ea2288cbbf403ed6958db7ae401650af86f13f94feb") fail();
  const path = /^data_jp\/([A-Za-z0-9_-]+)\/([0-9]{1,6})\.json$/.exec(source.relative_path || "");
  if (!path || path[1].toLowerCase() !== card.set_code.toLowerCase() || path[2] !== source.native_id ||
    source.provenance !== "ptcg-database:" + revision + ":" + source.relative_path + ":sha256:" + source.sha256 ||
    source.declared_card_url !== "https://www.pokemon-card.com/card-search/details.php/card/" + source.native_id) fail();
  canonicalReferenceURL(source.declared_card_url, "www.pokemon-card.com");
  if (Object.keys(ref).sort().join() !== ["source", "native_id", "set_code", "collector_number", "name", "rarity", "attributes_json", "provenance", "rights_reference", "display_allowed"].sort().join() ||
    ref.source !== "ptcg-database" || ref.native_id !== source.native_id || ref.set_code !== card.set_code ||
    ref.collector_number !== card.collector_number || ref.name !== card.name || ref.provenance !== source.provenance ||
    ref.rarity !== facts.rarity_raw || ref.display_allowed !== 0 || refAttributes.source_jp_id !== Number(source.native_id)) fail();
  if (raw.provenance === source.provenance) {
    if (attributes.source_jp_id !== Number(source.native_id)) fail();
  } else {
    const endpoint = /^tcgdex:a211f11f3ba57d56c65c5ac33be35b77d3280757:(data-asia\/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.ts):sha256:([a-f0-9]{64})$/.exec(raw.provenance);
    if (!endpoint || endpoint[1].split("/").some(part => ["", ".", ".."].includes(part))) fail();
  }
  const types = new Set(["Grass", "Fire", "Water", "Electric", "Psychic", "Fighting", "Dark", "Steel", "Colorless", "Dragon", "Fairy"]);
  const categories = new Set(["Pokémon", "サポート", "スタジアム", "グッズ", "基本エネルギー", "ポケモンのどうぐ", "特殊エネルギー", "トレーナー", "ワザマシン"]);
  const stages = new Set(["たね", "1 進化", "2 進化", "V進化", "復元", "V-UNION", "BREAK進化", "M進化", "レベルアップ", "伝説"]);
  if (Object.keys(facts).sort().join() !== ["illustrators", "illustrator_status", "rarity_raw", "rarity_icon_token", "rarity_label", "rarity_status", "card_type_raw", "hp", "types", "stage_raw", "field_statuses"].sort().join() ||
    !Array.isArray(facts.illustrators) || facts.illustrators.length > 20 || new Set(facts.illustrators).size !== facts.illustrators.length ||
    facts.illustrators.some(artist => !text(artist, 160) || artist !== artist.trim() || /[\u0000-\u001f]/.test(artist) || ["none", "unknown", "null", "n/a", "na", "not available", "?", "-"].includes(artist.toLowerCase())) ||
    !["not_declared", "existing_current_authority_preserved", "existing_current_authority_conflict_preserved", "source_supported_missing_artist", "invalid_source_credit_hold"].includes(facts.illustrator_status) ||
    (facts.illustrator_status === "source_supported_missing_artist" ? facts.illustrators.length === 0 : facts.illustrators.length !== 0) ||
    !(facts.rarity_raw === null || text(facts.rarity_raw)) ||
    !(facts.card_type_raw === null || categories.has(facts.card_type_raw)) ||
    !(facts.hp === null || Number.isSafeInteger(facts.hp) && facts.hp > 0 && facts.hp <= 10000) ||
    !(facts.types === null || Array.isArray(facts.types) && facts.types.length > 0 && facts.types.length <= 4 && facts.types.every(type => types.has(type)) && new Set(facts.types).size === facts.types.length) ||
    !(facts.stage_raw === null || stages.has(facts.stage_raw)) || !object(facts.field_statuses) ||
    Object.keys(facts.field_statuses).sort().join() !== ["card_type", "hp", "types", "stage"].sort().join()) fail();
  for (const key of ["card_type", "hp", "types", "stage"]) {
    const declared = facts[key === "card_type" ? "card_type_raw" : key === "stage" ? "stage_raw" : key];
    const state = facts.field_statuses[key];
    if (!["source_supported", "not_declared", "source_or_current_value_hold", "not_applicable_by_source_card_type"].includes(state) ||
      (state === "source_supported" ? declared === null : declared !== null) ||
      (key === "card_type" && state === "not_applicable_by_source_card_type") ||
      (key !== "card_type" && (facts.card_type_raw !== "Pokémon" ? state === "source_supported" : state === "not_applicable_by_source_card_type"))) fail();
  }
  const token = facts.rarity_raw === null ? null : "ic_" + facts.rarity_raw + ".gif";
  const known = token !== null && Object.prototype.hasOwnProperty.call(officialIconRarities, token);
  if (facts.rarity_status === "exact_source_code_projected") {
    if (!known || facts.rarity_raw !== raw.rarity || facts.rarity_icon_token !== token || facts.rarity_label !== officialIconRarities[token] ||
      card.rarity !== facts.rarity_label || !Object.prototype.hasOwnProperty.call(card, "source_rarity") || card.source_rarity !== raw.rarity) fail();
  } else {
    if (facts.rarity_icon_token !== null || facts.rarity_label !== null || card.rarity !== raw.rarity || Object.prototype.hasOwnProperty.call(card, "source_rarity")) fail();
    const expected = facts.rarity_raw === null ? "source_not_declared" : facts.rarity_raw === raw.rarity ? (known ? "exact_source_code_projected" : "unrecognized_source_code_not_projected") : "current_raw_rarity_differs_not_projected";
    if (facts.rarity_status !== expected) fail();
  }
  return value;
}
function sourceIdentityCardBase(card, digest) {
  const publisher = Object.prototype.hasOwnProperty.call(card, "pinned_publisher_metadata")
    ? pinnedPublisherMetadata(card.pinned_publisher_metadata, card, digest) : null;
  if (publisher) return publisher.publisher.rarity_status === "exact_source_code_projected" ? { ...card, rarity: publisher.identity.rarity } : card;
  const provider = Object.prototype.hasOwnProperty.call(card, "provider_metadata")
    ? providerMetadata(card.provider_metadata, card, digest) : null;
  if (provider && provider.provider.rarity !== null &&
    !Object.prototype.hasOwnProperty.call(card, "source_rarity")) fail();
  if (!Object.prototype.hasOwnProperty.call(card, "source_rarity")) return card;
  if (provider) {
    if (card.source_rarity !== null || provider.provider.rarity === null) fail();
    return { ...card, rarity: null };
  }
  const metadata = card.official_metadata, official = metadata?.official;
  if (!(card.source_rarity === null || text(card.source_rarity)) || card.language !== "ja" ||
    !object(metadata) || metadata.status !== "official_coordinate_metadata_supported" ||
    !/^official-metadata:[a-f0-9]{64}$/.test(metadata.evidence_id || "") ||
    ["physical_finish_verified", "listing_copy_verified", "price_comparable", "automatic_offer_join_allowed", "display_allowed"].some(key => metadata[key] !== false) ||
    !object(official) || !text(official.name) || !text(card.name) ||
    official.name.normalize("NFKC").replace(/\s/gu, "") !== card.name.normalize("NFKC").replace(/\s/gu, "") ||
    official.set_code !== card.set_code || official.collector_number !== card.collector_number ||
    !sha(official.page_sha256) || !text(official.fetched_at) || !Number.isFinite(Date.parse(official.fetched_at)) ||
    !text(card.rarity) || official.rarity !== card.rarity || official.rarity_status !== "recognized_icon" ||
    !Array.isArray(official.numbered_entries) || official.numbered_entries.length < 1 || official.numbered_entries.length > 4)
    fail();
  const page = canonicalReferenceURL(official.url, "www.pokemon-card.com");
  if (!/^\/card-search\/details\.php\/card\/[0-9]+$/.test(page.pathname)) fail();
  const coordinates = new Set();
  for (const entry of official.numbered_entries) {
    if (!object(entry) || !text(entry.set_code, 240) || !text(entry.collector_number, 240) ||
      ![null, "上", "下", "左", "右"].includes(entry.part_role) ||
      !Array.isArray(entry.rarity_icons) || entry.rarity_icons.length > 1 || entry.rarity_icons.some(icon => !text(icon, 160))) fail();
    const coordinateKey = JSON.stringify([entry.set_code, entry.collector_number]);
    if (coordinates.has(coordinateKey)) fail();
    coordinates.add(coordinateKey);
    const icon = entry.rarity_icons[0];
    const known = icon !== undefined && Object.prototype.hasOwnProperty.call(officialIconRarities, icon);
    if (known ? entry.rarity_status !== "recognized_icon" || entry.rarity !== officialIconRarities[icon]
      : entry.rarity !== null || entry.rarity_status !== (icon === undefined ? "no_rarity_icon" : "unrecognized_icon")) fail();
  }
  const selected = official.numbered_entries.filter(entry => entry.set_code === card.set_code && entry.collector_number === card.collector_number);
  if (selected.length !== 1 || official.page_kind !== (official.numbered_entries.length === 1 ? "single_number" : "numbered_parts") ||
    ["set_code", "collector_number", "part_role", "rarity", "rarity_status"].some(key => selected[0][key] !== official[key]) ||
    !Array.isArray(official.rarity_icons) || JSON.stringify(selected[0].rarity_icons) !== JSON.stringify(official.rarity_icons)) fail();
  return { ...card, rarity: card.source_rarity };
}
const officialDetailFalseClaims = ["fresh_source_fetch_claimed", "physical_finish_verified", "listing_copy_verified", "price_comparable", "automatic_offer_join_allowed", "display_allowed", "public_display_allowed", "source_access_approved", "matching_enable_allowed", "raw_attributes_overwrite_allowed", "official_metadata_overwrite_allowed", "rarity_projection_allowed", "artist_facet_appends_allowed", "image_binding_allowed"];
function officialAnchoredDetails(value, card, rawCard, digest) {
  const keys = ["schema", "status", "evidence_id", "identity", "identity_sha256", "reference", "reference_sha256", "official_parent", "source", "endpoint_source", "details", "claims_scope", ...officialDetailFalseClaims];
  const equalKeys = (objectValue, names) => object(objectValue) && Object.keys(objectValue).sort().join() === names.sort().join();
  if (!equalKeys(value, keys) || value.schema !== "pokemon.official-anchored-source-details.v1" || value.status !== "official_anchored_source_details_supported" ||
    !/^official-source-details:[a-f0-9]{64}$/.test(value.evidence_id || "") || officialDetailFalseClaims.some(key => value[key] !== false) ||
    card.language !== "ja" || card.provider_metadata != null || card.pinned_publisher_metadata != null || typeof digest !== "function" ||
    !object(value.identity) || !sha(value.identity_sha256) || digest(value.identity) !== value.identity_sha256 ||
    !object(value.reference) || !sha(value.reference_sha256) || digest(value.reference) !== value.reference_sha256 || !text(value.claims_scope)) fail();
  const raw = value.identity, ref = value.reference, source = value.source, parent = value.official_parent, fields = value.details;
  if (!equalKeys(raw, [...endpointFields, "attributes_json"]) || endpointFields.some(key => raw[key] !== rawCard[key]) ||
    typeof raw.attributes_json !== "string" || raw.attributes_json.length > 2097152) fail();
  let attributes, referenceAttributes;
  try { attributes = JSON.parse(raw.attributes_json); referenceAttributes = JSON.parse(ref.attributes_json); } catch { fail(); }
  if (!object(attributes) || !object(referenceAttributes) || !object(card.attributes) || digest(attributes) !== digest(card.attributes)) fail();
  const revision = "bc5a2698eb9af858feb0280d579fd5fd0f0273e2";
  if (!equalKeys(source, ["provider", "revision", "native_id", "relative_path", "sha256", "bytes", "provenance", "declared_card_url"]) ||
    source.provider !== "ptcg-database" || source.revision !== revision || !/^[0-9]{1,6}$/.test(source.native_id || "") || !sha(source.sha256) ||
    !Number.isSafeInteger(source.bytes) || source.bytes < 1 || source.bytes > 2097152) fail();
  const path = /^data_jp\/([A-Za-z0-9_-]+)\/([0-9]{1,6})\.json$/.exec(source.relative_path || "");
  if (!path || path[1].toLowerCase() !== card.set_code.toLowerCase() || path[2] !== source.native_id ||
    source.provenance !== "ptcg-database:" + revision + ":" + source.relative_path + ":sha256:" + source.sha256 ||
    source.declared_card_url !== "https://www.pokemon-card.com/card-search/details.php/card/" + source.native_id) fail();
  canonicalReferenceURL(source.declared_card_url, "www.pokemon-card.com");
  if (!equalKeys(ref, ["source", "native_id", "set_code", "collector_number", "name", "rarity", "attributes_json", "provenance", "rights_reference", "display_allowed"]) ||
    ref.source !== "ptcg-database" || ref.native_id !== source.native_id || ref.set_code !== card.set_code || ref.collector_number !== card.collector_number || ref.name !== card.name ||
    ref.provenance !== source.provenance || ref.display_allowed !== 0 || referenceAttributes.source_jp_id !== Number(source.native_id) ||
    ref.rights_reference !== "https://github.com/type-null/PTCG-database/blob/" + revision + "/LICENSE") fail();
  if (value.endpoint_source === null) {
    if (raw.provenance !== source.provenance || attributes.source_jp_id !== Number(source.native_id)) fail();
  } else {
    const endpoint = value.endpoint_source, nativeRevision = "a211f11f3ba57d56c65c5ac33be35b77d3280757";
    if (!equalKeys(endpoint, ["provider", "revision", "relative_path", "sha256"]) || endpoint.provider !== "tcgdex" || endpoint.revision !== nativeRevision || !sha(endpoint.sha256) ||
      !/^data-asia\/(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.ts$/.test(endpoint.relative_path || "") || endpoint.relative_path.split("/").some(part => ["", ".", ".."].includes(part)) ||
      raw.provenance !== "tcgdex:" + nativeRevision + ":" + endpoint.relative_path + ":sha256:" + endpoint.sha256) fail();
  }
  const metadata = card.official_metadata, official = metadata?.official;
  if (!object(metadata) || metadata.status !== "official_coordinate_metadata_supported" || !/^official-metadata:[a-f0-9]{64}$/.test(metadata.evidence_id || "") ||
    ["physical_finish_verified", "listing_copy_verified", "price_comparable", "automatic_offer_join_allowed", "display_allowed"].some(key => metadata[key] !== false) ||
    !Array.isArray(metadata.printed_source_corrections) || metadata.printed_source_corrections.length !== 0 || !object(official) ||
    !text(official.name) || official.name.normalize("NFKC").replace(/\s/gu, "") !== card.name.normalize("NFKC").replace(/\s/gu, "") ||
    official.set_code !== card.set_code || official.collector_number !== card.collector_number || official.page_kind !== "single_number" ||
    !Array.isArray(official.numbered_entries) || official.numbered_entries.length !== 1 || official.part_role !== null ||
    ["card_type", "hp", "types", "stage"].some(key => official[key] != null)) fail();
  if (!equalKeys(parent, ["evidence_id", "record_json_sha256", "url", "page_sha256", "fetched_at", "set_code", "collector_number", "page_kind"]) ||
    parent.evidence_id !== metadata.evidence_id || !sha(parent.record_json_sha256) || !sha(parent.page_sha256) || !text(parent.fetched_at) || !Number.isFinite(Date.parse(parent.fetched_at)) ||
    ["url", "page_sha256", "fetched_at", "set_code", "collector_number", "page_kind"].some(key => parent[key] !== official[key]) || parent.url !== source.declared_card_url) fail();
  canonicalReferenceURL(parent.url, "www.pokemon-card.com");
  const numbered = official.numbered_entries[0];
  if (!object(numbered) || ["set_code", "collector_number", "part_role", "rarity", "rarity_status"].some(key => numbered[key] !== official[key]) ||
    !Array.isArray(numbered.rarity_icons) || numbered.rarity_icons.length > 1 || JSON.stringify(numbered.rarity_icons) !== JSON.stringify(official.rarity_icons)) fail();
  const icon = numbered.rarity_icons[0], knownIcon = icon !== undefined && Object.prototype.hasOwnProperty.call(officialIconRarities, icon);
  if (knownIcon ? official.rarity_status !== "recognized_icon" || official.rarity !== officialIconRarities[icon] || card.rarity !== official.rarity
    : official.rarity !== null || official.rarity_status !== (icon === undefined ? "no_rarity_icon" : "unrecognized_icon")) fail();
  const categories = new Set(["Pokémon", "サポート", "スタジアム", "グッズ", "基本エネルギー", "ポケモンのどうぐ", "特殊エネルギー", "トレーナー", "ワザマシン"]);
  const types = new Set(["Grass", "Fire", "Water", "Electric", "Psychic", "Fighting", "Dark", "Steel", "Colorless", "Dragon", "Fairy"]);
  const stages = new Set(["たね", "1 進化", "2 進化", "V進化", "復元", "V-UNION", "BREAK進化", "M進化", "レベルアップ", "伝説"]);
  if (!equalKeys(fields, ["card_type_raw", "hp", "types", "stage_raw", "field_statuses"]) || !categories.has(fields.card_type_raw) ||
    !equalKeys(fields.field_statuses, ["card_type", "hp", "types", "stage"]) || fields.field_statuses.card_type !== "source_supported" || referenceAttributes.card_type !== fields.card_type_raw ||
    !(fields.hp === null || Number.isSafeInteger(fields.hp) && fields.hp > 0 && fields.hp <= 10000) ||
    !(fields.types === null || Array.isArray(fields.types) && fields.types.length > 0 && fields.types.length <= 4 && fields.types.every(type => types.has(type)) && new Set(fields.types).size === fields.types.length) ||
    !(fields.stage_raw === null || stages.has(fields.stage_raw))) fail();
  const pokemon = fields.card_type_raw === "Pokémon";
  for (const key of ["hp", "types", "stage"]) {
    const literal = fields[key === "stage" ? "stage_raw" : key], state = fields.field_statuses[key];
    const expected = !pokemon ? "not_applicable_by_source_card_type" : literal === null ? "not_declared" : "source_supported";
    if (state !== expected || !pokemon && literal !== null) fail();
    if (state === "source_supported" && key !== "stage" && JSON.stringify(referenceAttributes[key]) !== JSON.stringify(literal)) fail();
    if (state === "not_declared" && key !== "stage" && Object.prototype.hasOwnProperty.call(referenceAttributes, key)) fail();
  }
  return value;
}
function sourceIdentityCard(card, digest) {
  const raw = sourceIdentityCardBase(card, digest);
  if (Object.prototype.hasOwnProperty.call(card, "official_anchored_details")) officialAnchoredDetails(card.official_anchored_details, card, raw, digest);
  return raw;
}

function canonicalReferenceURL(value, host) {
  if (!https(value) || /[\s\\%]/.test(value) || [...value].some((c) => c.charCodeAt(0) <= 32 || c.charCodeAt(0) === 127)) fail();
  const url = new URL(value);
  if (url.hostname !== host || url.port || url.search || url.hash || url.href !== value ||
    url.pathname.split("/").slice(1).some((part) => ["", ".", ".."].includes(part))) fail();
  return url;
}
function secondaryNumberRelation(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || /[0-9][aAbB]$/.test(a) || /[0-9][aAbB]$/.test(b)) return null;
  if (/^[0-9]+$/.test(a) && /^[0-9]+$/.test(b)) return BigInt(a) === BigInt(b) ? "ascii_integer_equal" : null;
  if (/^H[0-9]+$/.test(a) && /^H[0-9]+$/.test(b)) return BigInt(a.slice(1)) === BigInt(b.slice(1)) ? "uppercase_H_ascii_integer_equal" : null;
  return a && a === b ? "literal_equal" : null;
}
function secondaryReferenceIdentity(value, card, digest) {
  const endpoint = value.endpoint_snapshot, proof = value.secondary_source_proof;
  const fields = ["native_document_ref", "native_document_sha256", "native_document_bytes", "native_set_code", "native_set_name", "native_local_id", "native_official_count", "manifest_document_ref", "manifest_document_sha256", "manifest_document_bytes", "manifest_set_index", "set_name", "printed_total", "card_index", "number_relation"];
  if (endpoint.language !== "en" || endpoint.variant !== "unverified_api_family" || endpoint.rarity !== null ||
    endpoint.match_eligible !== 0 || endpoint.display_allowed !== 0 || value.source_pin !== endpoint.provenance ||
    value.source_document_kind !== "pinned_repository_card_array" || !object(proof) ||
    Object.keys(proof).sort().join() !== fields.sort().join() || typeof digest !== "function" ||
    typeof value.endpoint_attributes_json !== "string" || value.endpoint_attributes_json.length > 2097152 ||
    !sha(value.acquisition_receipt_sha256)) fail();
  const doc = canonicalReferenceURL(value.source_document_ref, "raw.githubusercontent.com");
  const partition = /^\/PokemonTCG\/pokemon-tcg-data\/([a-f0-9]{40})\/(cards\/en\/([A-Za-z0-9_.-]+)\.json)$/.exec(doc.pathname);
  const native = /^tcgdex-api:v2:en:sets\/([A-Za-z0-9_.-]+):sha256:([a-f0-9]{64})$/.exec(value.source_pin);
  if (!partition || !native || !coordinate(value.source_set_code) || !coordinate(value.source_local_id) ||
    !coordinate(value.endpoint_native_card_id) || !coordinate(proof.native_set_code) || !coordinate(proof.native_local_id) ||
    value.source_set_code !== partition[3] || value.source_card_id !== value.source_set_code + "-" + value.source_local_id ||
    value.reference_provenance !== "pokemon-tcg-data:" + partition[1] + ":" + partition[2] + ":sha256:" + value.source_document_sha256 ||
    native[1].toLowerCase() !== endpoint.set_code.toLowerCase() || proof.native_set_code !== native[1] ||
    value.endpoint_native_card_id !== proof.native_set_code + "-" + proof.native_local_id ||
    !sameNumber(proof.native_local_id, endpoint.collector_number.split("/")[0])) fail();
  let attributes;
  try { attributes = JSON.parse(value.endpoint_attributes_json); } catch { fail(); }
  if (!object(attributes) || attributes.printing_variant_unresolved !== true ||
    !Array.isArray(attributes.source_card_ids) || attributes.source_card_ids.length !== 1 ||
    attributes.source_card_ids[0] !== value.endpoint_native_card_id || !object(card.attributes) ||
    digest(attributes) !== digest(card.attributes)) fail();
  const originalURL = "https://api.tcgdex.net/v2/en/cards/" + value.endpoint_native_card_id;
  const manifestURL = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/" + partition[1] + "/sets/en.json";
  canonicalReferenceURL(proof.native_document_ref, "api.tcgdex.net");
  canonicalReferenceURL(proof.manifest_document_ref, "raw.githubusercontent.com");
  if (proof.native_document_ref !== originalURL || proof.manifest_document_ref !== manifestURL ||
    !sha(proof.native_document_sha256) || !sha(proof.manifest_document_sha256) ||
    [proof.native_document_bytes, proof.manifest_document_bytes].some(size => !Number.isSafeInteger(size) || size < 1 || size > 2097152) ||
    [proof.card_index, proof.manifest_set_index].some(index => !Number.isSafeInteger(index) || index < 0 || index >= 5000) ||
    !text(proof.set_name, 2000) || proof.native_set_name !== proof.set_name ||
    !Number.isSafeInteger(proof.printed_total) || proof.printed_total < 1 ||
    proof.native_official_count !== proof.printed_total) fail();
  const fraction = endpoint.collector_number.split("/");
  const relation = secondaryNumberRelation(fraction[0], value.source_local_id);
  if (fraction.length !== 2 || !/^[0-9]+$/.test(fraction[1]) || BigInt(fraction[1]) !== BigInt(proof.printed_total) ||
    relation === null || relation !== proof.number_relation) fail();
  const image = canonicalReferenceURL(value.source_ref, "images.pokemontcg.io");
  if (image.pathname !== "/" + value.source_set_code + "/" + value.source_local_id + "_hires.png") fail();
}

function referenceIdentity(value, card, digest) {
  if (value.source_provider === "pokemon_tcg_data_reference") { secondaryReferenceIdentity(value, card, digest); return; }
  const endpoint = value.endpoint_snapshot;
  const sid = value.source_set_code, lid = value.source_local_id;
  if (!coordinate(sid) || !coordinate(lid) || sid.toLowerCase() !== endpoint.set_code.toLowerCase() ||
    !sameNumber(lid, endpoint.collector_number.split("/")[0]) || value.source_pin !== endpoint.provenance) fail();
  if (value.source_provider === "tcgdex") {
    if (!['card_detail', 'set_detail'].includes(value.source_document_kind) || value.source_card_id !== sid + "-" + lid) fail();
    const git = /^tcgdex:([a-f0-9]{40}):(.+\.ts):sha256:([a-f0-9]{64})$/.exec(value.source_pin);
    const api = /^tcgdex-api:v2:(en|ja):sets\/([A-Za-z0-9_.-]+):sha256:([a-f0-9]{64})$/.exec(value.source_pin);
    if (git) {
      const parts = git[2].split("/");
      if (parts[0] !== (endpoint.language === "en" ? "data" : "data-asia") || parts.length < 3 ||
        git[2].includes("\\") || parts.some((part) => ["", ".", ".."].includes(part)) ||
        (endpoint.language === "ja" && parts.at(-2).toLowerCase() !== sid.toLowerCase()) ||
        !sameNumber(parts.at(-1).slice(0, -3), lid)) fail();
    } else if (!api || api[1] !== endpoint.language || api[2].toLowerCase() !== sid.toLowerCase()) fail();
    canonicalReferenceURL(value.source_document_ref, "api.tcgdex.net");
    const document = "https://api.tcgdex.net/v2/" + endpoint.language +
      (value.source_document_kind === "card_detail" ? "/cards/" + value.source_card_id : "/sets/" + sid);
    if (value.source_document_ref !== document) fail();
    const image = canonicalReferenceURL(value.source_ref, "assets.tcgdex.net").pathname.split("/").slice(1);
    if (image.length !== 5 || image[0] !== endpoint.language || image.slice(0, 4).some((part) => !coordinate(part)) ||
      image[2].toLowerCase() !== sid.toLowerCase() || !sameNumber(image[3], lid) || image[4] !== "high.webp") fail();
  } else if (value.source_provider === "ptcg_database_reference") {
    const document = canonicalReferenceURL(value.source_document_ref, "github.com");
    const doc = /^\/type-null\/PTCG-database\/blob\/([a-f0-9]{40})\/(data_jp\/([A-Za-z0-9_.-]+)\/([0-9]{1,6})\.json)$/.exec(document.pathname);
    if (!doc || endpoint.language !== "ja" || value.source_document_kind !== "pinned_reference_json" ||
      sid !== doc[3] || sid.toLowerCase() !== endpoint.set_code.toLowerCase() || value.source_card_id !== doc[4] ||
      value.reference_provenance !== "ptcg-database:" + doc[1] + ":" + doc[2] + ":sha256:" + value.source_document_sha256) fail();
    const git = /^tcgdex:([a-f0-9]{40}):(.+\.ts):sha256:([a-f0-9]{64})$/.exec(value.source_pin);
    const api = /^tcgdex-api:v2:ja:sets\/([A-Za-z0-9_.-]+):sha256:([a-f0-9]{64})$/.exec(value.source_pin);
    if (git) {
      const parts = git[2].split("/");
      if (parts[0] !== "data-asia" || parts.length < 3 || parts.some(part => ["", ".", ".."].includes(part)) ||
        git[2].includes("\\") || parts.at(-2).toLowerCase() !== sid.toLowerCase() ||
        !sameNumber(parts.at(-1).slice(0, -3), lid) || value.endpoint_native_card_id !== null) fail();
    } else if (api) {
      const native = value.endpoint_native_card_id;
      const split = typeof native === "string" ? native.lastIndexOf("-") : -1;
      const ids = card.attributes?.source_card_ids;
      if (api[1].toLowerCase() !== sid.toLowerCase() || split < 1 ||
        native.slice(0, split).toLowerCase() !== api[1].toLowerCase() || !sameNumber(native.slice(split + 1), lid) ||
        !Array.isArray(ids) || ids.length !== 1 || ids[0] !== native) fail();
    } else fail();
    const image = canonicalReferenceURL(value.source_ref, "www.pokemon-card.com").pathname;
    if (!coordinate(value.source_folder)) fail();
    const prefix = "/assets/images/card_images/large/" + value.source_folder + "/" + doc[4].padStart(6, "0") + "_";
    if (!image.startsWith(prefix) || !/^[A-Za-z0-9_.-]+\.jpg$/.test(image.slice(prefix.length))) fail();
  } else {
    const pin = /^ptcg-database:([a-f0-9]{40}):(data_jp\/([A-Za-z0-9_.-]+)\/([0-9]{1,6})\.json):sha256:([a-f0-9]{64})$/.exec(value.source_pin);
    if (!pin || endpoint.language !== "ja" || value.source_document_kind !== "pinned_native_json" ||
      value.source_document_sha256 !== pin[5] || value.source_card_id !== pin[4] || sid.toLowerCase() !== pin[3].toLowerCase()) fail();
    canonicalReferenceURL(value.source_document_ref, "github.com");
    if (value.source_document_ref !== "https://github.com/type-null/PTCG-database/blob/" + pin[1] + "/" + pin[2]) fail();
    const image = canonicalReferenceURL(value.source_ref, "www.pokemon-card.com").pathname;
    const prefix = "/assets/images/card_images/large/" + pin[3] + "/" + pin[4].padStart(6, "0") + "_";
    if (!image.startsWith(prefix) || !/^[A-Za-z0-9_.-]+\.jpg$/.test(image.slice(prefix.length))) fail();
  }
}
function exactSnapshot(value, card, digest, current = true) {
  const identityCard = sourceIdentityCard(card, digest);
  if (
    !object(value) ||
    Object.keys(value).sort().join() !== [...endpointFields].sort().join() ||
    value.card_id !== card.card_id ||
    value.card_id !== [value.language, value.set_code, value.collector_number, value.variant].join(":") ||
    !["ja", "en"].includes(value.language) ||
    ["card_id", "set_code", "collector_number", "variant", "name", "provenance", "rights_reference"].some((key) => !text(value[key])) ||
    !(value.rarity === null || text(value.rarity)) ||
    ![0, 1].includes(value.match_eligible) || ![0, 1].includes(value.display_allowed) ||
    !sha(digest(value)) ||
    (current && endpointFields.some((key) => value[key] !== identityCard[key]))
  ) fail();
}
function sourceReference(value, card, digest) {
  if (value === null || value === undefined) return null;
  if (value.schema === "pokemon.catalog-source-image-context.v2")
    return require("./sourceGifContract.cjs").sourceReference(value, card, digest, {sourceIdentityCard, exactSnapshot, endpointFields});
  if (
    !object(value) ||
    value.schema !== "pokemon.catalog-source-image-context.v1" ||
    value.card_id !== card.card_id ||
    value.evidence_basis !== "catalog_source_reference" ||
    value.binding_scope !== "source_card_reference" ||
    !/^catalog-source-image:[a-f0-9]{64}$/.test(value.event_id) ||
    !["current", "stale", "held"].includes(value.status) ||
    !["selected", "superseded", "held"].includes(value.selection_status) ||
    (value.selection_status === "held" && value.status !== "held") ||
    typeof value.current_endpoint !== "boolean" ||
    (value.status === "current" && !value.current_endpoint) ||
    (value.status === "stale" && value.current_endpoint) ||
    !https(value.source_ref) || !sha(value.image_sha256) ||
    !["tcgdex", "ptcg_database", "ptcg_database_reference", "pokemon_tcg_data_reference"].includes(value.source_provider) || !text(value.source_card_id, 240) ||
    !https(value.source_document_ref) || !sha(value.source_document_sha256) ||
    value.inspection_tier !== "provider_declared_source_reference" ||
    !validWarnings(value.warnings) || value.warnings.length !== 2 ||
    !value.warnings.includes("finish_edition_unverified") ||
    !value.warnings.includes("not_visually_reviewed") ||
    !text(value.scope) || referenceFalseAuthority.some((key) => value[key] !== false) ||
    value.number_reading_qualification_changed !== false ||
    !sha(value.identity_sha256) || typeof digest !== "function"
  ) fail();
  const identityCard = sourceIdentityCard(card, digest);
  exactSnapshot(value.endpoint_snapshot, card, digest, value.current_endpoint);
  if (digest(value.endpoint_snapshot) !== value.identity_sha256 ||
    value.current_endpoint !== endpointFields.every((key) => value.endpoint_snapshot[key] === identityCard[key])) fail();
  referenceIdentity(value, card, digest);
  return value;
}
function primaryImage(value, card, facts, number, reference, digest) {
  if (value === undefined) {
    // A reference requires explicit server selection; a retained context is
    // never tried as an alternative to existing reviewed evidence.
    if (reference) fail();
    return null;
  }
  if (
    !object(value) || value.schema !== "pokemon.catalog-primary-image.v1" ||
    value.card_id !== card.card_id || !["current", "stale", "held", "missing"].includes(value.status) ||
    typeof value.current_endpoint !== "boolean" || !sha(value.identity_sha256) ||
    typeof digest !== "function" || !text(value.reason) ||
    falseAuthority.some((key) => value[key] !== false)
  ) fail();
  exactSnapshot(value.endpoint_snapshot, card, digest);
  if (digest(value.endpoint_snapshot) !== value.identity_sha256) fail();
  if (reference?.selection_status === "held" &&
    (value.status !== "held" || value.basis !== null || value.event_id !== null ||
      value.source_ref !== null || value.image_sha256 !== null || value.scope !== null ||
      value.current_endpoint !== false)) fail();
  const selected = value.basis === "source_image_facts" ? facts
    : value.basis === "number_reading" ? number
    : value.basis === "catalog_source_reference" ? reference
    : null;
  if (value.basis === null) {
    if (!['held', 'missing'].includes(value.status) || value.event_id !== null ||
      value.source_ref !== null || value.image_sha256 !== null || value.scope !== null ||
      value.current_endpoint !== false || (value.status === 'missing' && (facts || number || reference))) fail();
  } else {
    const prefix = { source_image_facts: "source-image-fact", number_reading: "number-reading", catalog_source_reference: "catalog-source-image" }[value.basis];
    if (!prefix || !selected ||
      !new RegExp("^" + prefix + ":[a-f0-9]{64}$").test(value.event_id) ||
      value.event_id !== selected.event_id || value.source_ref !== selected.source_ref ||
      value.image_sha256 !== selected.image_sha256 ||
      value.current_endpoint !== selected.current_endpoint ||
      value.scope !== (value.basis === "catalog_source_reference" ? "source_card_reference" : "reviewed_source_scan") ||
      (value.basis === "catalog_source_reference" && reference.selection_status !== "selected") ||
      (value.status === "current" && (!value.current_endpoint ||
        (value.basis === "catalog_source_reference" && reference.status !== "current") ||
        (value.basis === "number_reading" && (!number.visible_text_agreement || number.source_coordinate_conflict)))) ||
      (value.status === "stale" && value.current_endpoint) || value.status === "missing") fail();
    // The original reviewed primary cannot be replaced by a current number
    // context or an imported reference through response field omission.
    if (value.basis === "number_reading" && facts) fail();
    if (value.basis !== "catalog_source_reference" && reference?.selection_status === "selected") fail();
    if (value.basis === "catalog_source_reference" && (facts || number) && value.status !== "held") fail();
  }
  if (card.variant_dimension_hold && value.status !== "held") fail();
  return { ...value, record: selected };
}
function hold(value, card) {
  if (value === undefined) return null;
  if (
    !object(value) ||
    value.schema !== "pokemon.variant-dimension-context.v1" ||
    !["held_legacy_variant_dimensions", "stale_hold_source_changed"].includes(
      value.status,
    ) ||
    value.legacy_card_id !== card.card_id ||
    value.legacy_variant !== card.variant ||
    !/^variant-dimension-hold:[a-f0-9]{64}$/.test(value.event_id) ||
    !/^[a-f0-9]{40}$/.test(value.source_revision) ||
    !sha(value.source_sha256) ||
    !text(value.declared_source_size, 100) ||
    value.dimension_complete_identity !== false ||
    value.canonical_replacement_card_id !== null ||
    !Array.isArray(value.replacement_relationships) ||
    value.replacement_relationships.length ||
    !text(value.reason) ||
    value.physical_size_verified !== false ||
    value.display_allowed !== false ||
    value.image_display_allowed !== false ||
    value.purchase_allowed !== false ||
    value.automatic_offer_join_allowed !== false ||
    value.price_comparable !== false ||
    value.physical_printing_verified !== false ||
    card.match_eligible !== 0 ||
    card.display_allowed !== 0
  )
    fail();
  return { ...value, replacement_relationships: [] };
}
function availability(value, card) {
  const h = hold(card.variant_dimension_hold, card);
  if (value === undefined) {
    if (h) fail();
    return null;
  }
  const states = [
    "current_source_scan_evidence",
    "missing_source_scan_evidence",
    "stale_source_scan_evidence",
    "held_source_scan_evidence",
    "identity_hold",
  ];
  if (
    !object(value) ||
    value.schema !== "pokemon.catalog-media-availability.v1" ||
    !states.includes(value.status) ||
    typeof value.current_endpoint !== "boolean" ||
    typeof value.with_source_scans_eligible !== "boolean" ||
    value.with_source_scans_eligible !==
      (value.status === "current_source_scan_evidence") ||
    value.live_fetch_verified !== false ||
    value.display_allowed !== false ||
    value.physical_printing_verified !== false ||
    (value.status === "identity_hold") !== !!h ||
    !validWarnings(value.warnings)
  )
    fail();
  const present = value.source_scan_event_id !== null;
  if (present) {
    if (
      !["source_image_facts", "number_reading"].includes(
        value.evidence_basis,
      ) ||
      !new RegExp(
        "^" +
          (value.evidence_basis === "source_image_facts"
            ? "source-image-fact"
            : "number-reading") +
          ":[a-f0-9]{64}$",
      ).test(value.source_scan_event_id) ||
      !https(value.source_ref) ||
      !sha(value.image_sha256) ||
      !text(value.inspection_tier, 100)
    )
      fail();
  } else if (
    value.evidence_basis !== null ||
    value.source_ref !== null ||
    value.image_sha256 !== null ||
    value.inspection_tier !== null ||
    value.current_endpoint !== false
  )
    fail();
  if (
    (value.status === "current_source_scan_evidence" &&
      (!present || !value.current_endpoint)) ||
    (value.status === "missing_source_scan_evidence" && present) ||
    (value.status === "stale_source_scan_evidence" &&
      (!present || value.current_endpoint)) ||
    (value.status === "held_source_scan_evidence" && !present)
  )
    fail();
  return { ...value };
}
function matchDetail(a, facts, number) {
  if (!a) return;
  const r = facts ?? number;
  if (!r) {
    if (a.source_scan_event_id !== null) fail();
    return;
  }
  const basis =
    facts !== null && facts !== undefined
      ? "source_image_facts"
      : "number_reading";
  if (
    a.evidence_basis !== basis ||
    a.source_scan_event_id !== r.event_id ||
    a.source_ref !== r.source_ref ||
    a.image_sha256 !== r.image_sha256 ||
    a.current_endpoint !== r.current_endpoint
  )
    fail();
  if (a.status !== "identity_hold") {
    const state = !r.current_endpoint
      ? "stale_source_scan_evidence"
      : basis === "number_reading" &&
          (!r.visible_text_agreement ||
            r.status === "reading_hold" ||
            r.source_coordinate_conflict === true)
        ? "held_source_scan_evidence"
        : "current_source_scan_evidence";
    if (a.status !== state) fail();
  }
}
function scanState(media, availability, failed = false, numberHeld = false) {
  if (availability?.status === "identity_hold")
    return {
      status: "identity_hold",
      message:
        "Image matching is held while this record's variant identity is reviewed.",
    };
  if (availability?.status === "held_source_scan_evidence" || numberHeld)
    return { status: "held", message: "The source scan is on review hold." };
  if (!media)
    return {
      status: "missing",
      message: "No reviewed scan recorded for this exact card.",
    };
  if (!media.current_endpoint)
    return { status: "stale", message: "Scan evidence is stale." };
  if (failed)
    return {
      status: "failed",
      message: "The recorded source scan could not be loaded. Try again.",
    };
  return {
    status: "recorded",
    message: media.basis === "catalog_source_reference"
      ? "Card artwork reference · finish and edition unverified"
      : "Source scan evidence recorded",
  };
}
function referenceCaption(media, card, details = []) {
  if (media?.basis !== "catalog_source_reference" || media.current_endpoint !== true)
    return null;
  const variants = new Set([card.variant]);
  for (const detail of details) {
    const other = detail.card, image = detail.media_evidence;
    if (other && image?.basis === "catalog_source_reference" &&
      image.current_endpoint === true && !detail.source_scan_hold &&
      !other.variant_dimension_hold &&
      ["language", "set_code", "collector_number"].every((key) => other[key] === card[key]) &&
      other.card_id !== card.card_id &&
      image.image_sha256 === media.image_sha256 && image.source_ref === media.source_ref)
      variants.add(other.variant);
  }
  const label = (variant) => variant === "reverse" ? "Reverse holo"
    : variant === "normal" ? "Normal" : variant.replaceAll("_", " ");
  return variants.size > 1
    ? { label: "Shared card artwork", message: [...variants].sort().map(label).join(" / ") +
        " use the same provider image. Their finishes are not verified by this image." }
    : { label: "Card artwork reference", message: "This image does not verify " +
        (card.variant === "reverse" ? "the reverse-holo finish or edition." : "finish or edition.") };
}
function coverage(value, total) {
  if (value === undefined) return null;
  const keys = [
    "current_source_scan_evidence",
    "missing_source_scan_evidence",
    "stale_source_scan_evidence",
    "held_source_scan_evidence",
    "identity_hold",
  ];
  const count = (v) => Number.isSafeInteger(v) && v >= 0;
  if (
    !object(value) ||
    value.schema !== "pokemon.source-scan-coverage.v1" ||
    value.catalog_records !== total ||
    !count(value.source_scan_subjects) ||
    value.source_scan_subjects > total ||
    !count(value.current_source_scan_subjects) ||
    !object(value.by_status) ||
    Object.keys(value.by_status).sort().join() !== keys.sort().join() ||
    Object.values(value.by_status).some((v) => !count(v)) ||
    Object.values(value.by_status).reduce((a, b) => a + b, 0) !== total ||
    value.current_source_scan_subjects !==
      value.by_status.current_source_scan_evidence ||
    !object(value.by_evidence_basis) ||
    Object.keys(value.by_evidence_basis).some(
      (k) => !["source_image_facts", "number_reading"].includes(k),
    ) ||
    Object.values(value.by_evidence_basis).some((v) => !count(v)) ||
    Object.values(value.by_evidence_basis).reduce((a, b) => a + b, 0) !==
      value.source_scan_subjects ||
    value.live_media_availability !== "unverified" ||
    value.image_display_permissions !== 0 ||
    !text(value.scope)
  )
    fail();
  const evidence =
    value.by_status.current_source_scan_evidence +
    value.by_status.stale_source_scan_evidence +
    value.by_status.held_source_scan_evidence;
  if (
    evidence > value.source_scan_subjects ||
    value.source_scan_subjects - evidence > value.by_status.identity_hold
  )
    fail();
  return {
    ...value,
    by_status: { ...value.by_status },
    by_evidence_basis: { ...value.by_evidence_basis },
  };
}
function referenceCoverage(value, total) {
  if (value === undefined) return null;
  const keys = ["current", "stale", "held", "superseded"];
  const count = (v) => Number.isSafeInteger(v) && v >= 0;
  if (!object(value) || value.schema !== "pokemon.catalog-source-image-coverage.v1" ||
    value.catalog_records !== total || !count(value.reference_subjects) || value.reference_subjects > total ||
    !object(value.by_status) || Object.keys(value.by_status).sort().join() !== keys.sort().join() ||
    Object.values(value.by_status).some((n) => !count(n)) ||
    Object.values(value.by_status).reduce((a, b) => a + b, 0) !== value.reference_subjects ||
    value.current_primary_references !== value.by_status.current ||
    value.reviewed_scan_coverage_changed !== false || value.image_display_permissions !== 0 || !text(value.scope)) fail();
  return { ...value, by_status: { ...value.by_status } };
}
module.exports = { availability, hold, matchDetail, scanState, referenceCaption, coverage, referenceCoverage, primaryImage, sourceReference, endpointFields, sourceIdentityCard };
