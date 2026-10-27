"use strict";
const { randomBytes } = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { isDeepStrictEqual } = require("node:util");
const { cloudTestScope } = require("../creator/src/lib/pokemon/cloudTestScope.cjs");
const { CATALOG_DIRECTORY, readReviewedCatalog } = require("./catalog-artifact.cjs");

function officialEbayConfiguration(env, now) {
  const enabled = env.POKEMON_COMMERCE_EBAY_BROWSE_ENABLED;
  if (Object.hasOwn(env, "POKEMON_COMMERCE_EBAY_BROWSE_ENABLED") && !["true", "false"].includes(enabled))
    throw Error("invalid_official_ebay_configuration");
  const bounded = ["POKEMON_COMMERCE_EBAY_READ_UNTIL", "POKEMON_COMMERCE_EBAY_REQUEST_BUDGET"];
  if (enabled !== "true") {
    if (bounded.some(key => Object.hasOwn(env, key))) throw Error("official_ebay_bounds_require_access");
    return null;
  }
  if (env.POKEMON_COMMERCE_MANAGED_SIDECAR !== "true") throw Error("official_ebay_requires_managed_sidecar");
  if (!cloudTestScope(env, now)) throw Error("private_commerce_scope_required");
  if (["POKEMON_COMMERCE_FIXTURE", "POKEMON_COMMERCE_CRAWL_ENABLED", "POKEMON_COMMERCE_BNS_ENABLED", "POKEMON_COMMERCE_PSA_ENABLED"]
      .some(key => env[key] !== "false") ||
      ["POKEMON_COMMERCE_PUBLIC_LISTING_URLS", "POKEMON_COMMERCE_PUBLIC_REQUEST_BUDGET", "POKEMON_COMMERCE_EBAY_BROWSE_URLS",
        "POKEMON_COMMERCE_BROWSER_RENDERER", "POKEMON_COMMERCE_BROWSER_PROBE", "POKEMON_COMMERCE_QUOTE_DB",
        "PSA_API_TOKEN", "BNS_PARTNER_BASE_URL", "BNS_PARTNER_CLIENT_ID", "BNS_PARTNER_CLIENT_SECRET"]
        .some(key => Object.hasOwn(env, key)) ||
      env.POKEMON_COMMERCE_BNS_URL_PREVIEW !== undefined && env.POKEMON_COMMERCE_BNS_URL_PREVIEW !== "false" ||
      ["POKEMON_CREATOR_SYNTHETIC_DEMO", "POKEMON_PHYSICAL_FIXTURE_ENABLED"].some(key => env[key] !== undefined && env[key] !== "false"))
    throw Error("official_ebay_requires_read_only_configuration");
  // This bridge always uses the production-only Browse client. A sandbox or
  // alternate host must never be presented as current marketplace evidence.
  if (["EBAY_ENVIRONMENT", "EBAY_API_ENVIRONMENT"].some(key => env[key] !== undefined && env[key] !== "production") ||
      ["EBAY_API_BASE_URL", "EBAY_BASE_URL", "EBAY_BROWSE_BASE_URL", "EBAY_TOKEN_URL", "EBAY_API_URL", "EBAY_SANDBOX"]
        .some(key => Object.hasOwn(env, key)))
    throw Error("official_ebay_production_configuration_required");
  if (env.EBAY_PRODUCTION_APPROVED !== "true" || env.EBAY_DISPLAY_APPROVED !== "true" ||
      ["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"].some(key => typeof env[key] !== "string" ||
        !env[key].length || env[key].length > 4096 || /[\s\x00-\x1f\x7f]/.test(env[key])))
    throw Error("official_ebay_access_not_configured");
  // GCS chat history retains eBay-derived metadata. This operator flag requires
  // a separate review of that retention and deletion-notification compliance;
  // a memory-only/no-store waiver cannot authorize this persistent path.
  if (env.EBAY_PERSISTENT_DATA_APPROVED !== "true")
    throw Error("official_ebay_persistence_not_approved");
  const until = env.POKEMON_COMMERCE_EBAY_READ_UNTIL, deadline = Date.parse(until);
  const canonical = Number.isFinite(deadline) ? new Date(deadline).toISOString() : "";
  if (typeof until !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(until) ||
      ![canonical, canonical.replace(".000Z", "Z")].includes(until) ||
      deadline <= now || deadline - now > 90 * 60000 || deadline > Date.parse(env.POKEMON_CREATOR_STATE_EXPIRES_AT))
    throw Error("invalid_official_ebay_read_window");
  const budget = env.POKEMON_COMMERCE_EBAY_REQUEST_BUDGET;
  if (typeof budget !== "string" || !/^(?:[1-9]|1[0-9]|20)$/.test(budget))
    throw Error("invalid_official_ebay_request_budget");
  return { until, budget };
}

function configuration(env = process.env, { catalogPreflight = readReviewedCatalog, now = Date.now() } = {}) {
  const officialEbay = officialEbayConfiguration(env, now);
  const artifactConfigured = Object.hasOwn(env, "POKEMON_COMMERCE_CATALOG_ARTIFACT");
  const manifestConfigured = Object.hasOwn(env, "POKEMON_COMMERCE_CATALOG_MANIFEST_SHA256");
  if (Object.hasOwn(env, "POKEMON_COMMERCE_CATALOG_DB")) throw Error("managed_catalog_requires_reviewed_artifact");
  if (env.POKEMON_COMMERCE_MANAGED_SIDECAR !== "true") {
    if (artifactConfigured || manifestConfigured) throw Error("catalog_artifact_requires_managed_sidecar");
    return null;
  }
  if (!cloudTestScope(env, now)) throw Error("private_commerce_scope_required");
  const fixture = env.POKEMON_COMMERCE_FIXTURE === "true";
  if (artifactConfigured !== manifestConfigured || artifactConfigured &&
      (env.POKEMON_COMMERCE_CATALOG_ARTIFACT !== CATALOG_DIRECTORY ||
       typeof env.POKEMON_COMMERCE_CATALOG_MANIFEST_SHA256 !== "string" ||
       !/^[a-f0-9]{64}$/.test(env.POKEMON_COMMERCE_CATALOG_MANIFEST_SHA256)))
    throw Error("invalid_catalog_artifact_configuration");
  if (artifactConfigured && fixture) throw Error("catalog_artifact_requires_research_mode");
  const crawlConfigured = Object.hasOwn(env, "POKEMON_COMMERCE_CRAWL_ENABLED");
  if (artifactConfigured && !crawlConfigured) throw Error("catalog_artifact_requires_explicit_crawl_configuration");
  if (crawlConfigured && !["true", "false"].includes(env.POKEMON_COMMERCE_CRAWL_ENABLED))
    throw Error("invalid_commerce_crawl_configuration");
  const crawl = env.POKEMON_COMMERCE_CRAWL_ENABLED !== "false";
  const urlPreview = env.POKEMON_COMMERCE_BNS_URL_PREVIEW === "true";
  let browse = [];
  if (env.POKEMON_COMMERCE_EBAY_BROWSE_URLS !== undefined) {
    try { browse = JSON.parse(env.POKEMON_COMMERCE_EBAY_BROWSE_URLS); } catch { throw Error("invalid_ebay_browse_configuration"); }
    if (!Array.isArray(browse) || browse.length > 5 || new Set(browse).size !== browse.length || browse.some(value => {
      if (typeof value !== "string" || value.length > 2048 || /[\s\\\x00-\x1f\x7f]/.test(value)) return true;
      try { const u = new URL(value); return u.protocol !== "https:" || !["www.ebay.com", "ebay.com"].includes(u.hostname) ||
        u.username || u.password || u.port || u.search || u.hash || !/^\/b\/[A-Za-z0-9_-]+\/[0-9]+\/bn_[0-9]+\/?$/.test(u.pathname); }
      catch { return true; }
    })) throw Error("invalid_ebay_browse_configuration");
  }
  let publicListings = null;
  const publicListingsConfigured = Object.hasOwn(env, "POKEMON_COMMERCE_PUBLIC_LISTING_URLS");
  const publicBudgetConfigured = Object.hasOwn(env, "POKEMON_COMMERCE_PUBLIC_REQUEST_BUDGET");
  const publicBudget = env.POKEMON_COMMERCE_PUBLIC_REQUEST_BUDGET;
  if (publicBudgetConfigured && !publicListingsConfigured)
    throw Error("public_request_budget_requires_listing_scope");
  if (publicListingsConfigured) {
    try { publicListings = JSON.parse(env.POKEMON_COMMERCE_PUBLIC_LISTING_URLS); }
    catch { throw Error("invalid_public_listing_configuration"); }
    if (!Array.isArray(publicListings) || publicListings.length < 1 || publicListings.length > 5 ||
      new Set(publicListings).size !== publicListings.length || publicListings.some(value =>
        typeof value !== "string" || value.length > 2048 ||
        !/^https:\/\/snkrdunk\.com\/apparels\/[0-9]+\/used\/[0-9]+$/.test(value)))
      throw Error("invalid_public_listing_configuration");
    if (!publicBudgetConfigured || typeof publicBudget !== "string" || !/^(?:[1-9]|1[0-2])$/.test(publicBudget))
      throw Error("invalid_public_request_budget_configuration");
    // This is a separate, closed capability. The backend also enforces these
    // exact URLs before transport; a UI platform filter is not authorization.
    if (env.POKEMON_COMMERCE_FIXTURE !== "false" || !crawlConfigured || !crawl ||
      env.POKEMON_COMMERCE_BNS_ENABLED !== "false" || env.POKEMON_COMMERCE_PSA_ENABLED !== "false" ||
      urlPreview || browse.length > 0 ||
      ["POKEMON_COMMERCE_BROWSER_RENDERER", "POKEMON_COMMERCE_BROWSER_PROBE"].some(key => Object.hasOwn(env, key)) ||
      ["PSA_API_TOKEN", "BNS_PARTNER_BASE_URL", "BNS_PARTNER_CLIENT_ID", "BNS_PARTNER_CLIENT_SECRET", "POKEMON_COMMERCE_QUOTE_DB"]
        .some(key => Object.hasOwn(env, key)))
      throw Error("public_listing_requires_read_only_configuration");
  }
  if (fixture && crawlConfigured && crawl) throw Error("commerce_fixture_cannot_mix_with_live_crawl");
  if (!crawl && (browse.length > 0 || Object.hasOwn(env, "POKEMON_COMMERCE_BROWSER_RENDERER")))
    throw Error("offline_commerce_cannot_mix_with_crawl_configuration");
  if (fixture && (env.POKEMON_COMMERCE_BNS_ENABLED === "true" || urlPreview ||
    browse.length > 0 ||
    env.POKEMON_COMMERCE_PSA_ENABLED === "true" ||
    env.POKEMON_COMMERCE_BROWSER_RENDERER === "1" ||
    ["PSA_API_TOKEN", "BNS_PARTNER_BASE_URL", "BNS_PARTNER_CLIENT_ID", "BNS_PARTNER_CLIENT_SECRET", "POKEMON_COMMERCE_QUOTE_DB"]
      .some(key => Object.hasOwn(env, key))))
    throw Error("commerce_fixture_cannot_mix_with_provider_access");
  // A per-instance secret is shared only by the two server processes. Never
  // persist it in Cloud Run metadata, browser state, logs or build artifacts.
  const token = randomBytes(32).toString("hex");
  const args = ["-m", "pokemon_index.commerce_service", "--port", "8766"];
  if (fixture) args.push("--fixture");
  else if (publicListings) {
    args.push("--allow-live-crawl", "--source", "snkrdunk",
      "--public-read-until", env.POKEMON_CREATOR_STATE_EXPIRES_AT, "--public-request-budget", publicBudget);
    for (const url of publicListings) args.push("--public-listing-url", url);
  }
  else if (crawl) args.push("--allow-live-crawl", "--browser-renderer", "--source", "mercari",
    "--source", "snkrdunk", "--source", "ebay_us");
  for (const url of browse) args.push("--ebay-browse-url", url);
  if (officialEbay) args.push("--allow-live-ebay-browse", "--ebay-read-until", officialEbay.until,
    "--ebay-request-budget", officialEbay.budget);
  if (env.POKEMON_COMMERCE_PSA_ENABLED === "true") {
    if (!env.PSA_API_TOKEN) throw Error("psa_access_not_configured");
    args.push("--allow-live-psa");
  }
  if (urlPreview && env.POKEMON_COMMERCE_BNS_ENABLED !== "true") throw Error("bns_url_preview_requires_access");
  if (env.POKEMON_COMMERCE_BNS_ENABLED === "true") {
    if (!["BNS_PARTNER_BASE_URL", "BNS_PARTNER_CLIENT_ID", "BNS_PARTNER_CLIENT_SECRET"].every(k => env[k]))
      throw Error("bns_access_not_configured");
    if (urlPreview) {
      if (Object.hasOwn(env, "POKEMON_COMMERCE_QUOTE_DB")) throw Error("bns_url_preview_cannot_mix_with_quote_db");
      args.push("--allow-live-buyship", "--buyship-url-preview");
    } else {
      if (!env.POKEMON_COMMERCE_QUOTE_DB) throw Error("bns_access_not_configured");
      args.push("--allow-live-buyship", "--quote-db", env.POKEMON_COMMERCE_QUOTE_DB);
    }
  }
  let catalogReceipt;
  if (artifactConfigured) {
    // This private identity profile grants no public display, image, inventory,
    // provider or purchase permission. The backend validates SQLite semantics.
    catalogReceipt = catalogPreflight(CATALOG_DIRECTORY, env.POKEMON_COMMERCE_CATALOG_MANIFEST_SHA256)?.expectedReceipt;
    if (!catalogReceipt) throw Error("catalog_artifact_receipt_required");
    args.push("--catalog-artifact", CATALOG_DIRECTORY, "--catalog-manifest-sha256", env.POKEMON_COMMERCE_CATALOG_MANIFEST_SHA256);
  }
  return { args, mode: fixture ? "synthetic_fixture" : "on_demand_research",
    ...(catalogReceipt ? { catalogReceipt } : {}),
    env: { POKEMON_COMMERCE_URL: "http://127.0.0.1:8766", POKEMON_COMMERCE_TOKEN: token } };
}

function start(root, env = process.env, { spawnChild = spawn, httpGet = http.get, catalogPreflight = readReviewedCatalog } = {}) {
  const config = configuration(env, { catalogPreflight });
  if (!config) return null;
  const child = spawnChild("python3", config.args, { cwd: path.join(root, "commerce-backend"),
    env: { ...env, ...config.env, PYTHONDONTWRITEBYTECODE: "1", NODE_PATH: "/opt/browser/node_modules" },
    stdio: ["ignore", "inherit", "inherit"] });
  const ready = () => new Promise(resolve => {
    const req = httpGet(config.env.POKEMON_COMMERCE_URL + "/commerce/health", {
      headers: { Authorization: "Bearer " + config.env.POKEMON_COMMERCE_TOKEN, "X-Commerce-Owner": "startup-probe" }
    }, res => {
      let raw = "", oversized = false;
      res.on("data", part => {
        raw += part;
        if (Buffer.byteLength(raw, "utf8") > 4096) { oversized = true; req.destroy(); resolve(false); }
      });
      res.on("end", () => {
        if (oversized) return resolve(false);
        try { const r = JSON.parse(raw); resolve(res.statusCode === 200 && r.ok === true && r.mode === config.mode &&
          (!config.catalogReceipt || isDeepStrictEqual(r.catalog, config.catalogReceipt))); }
        catch { resolve(false); }
      });
    });
    req.setTimeout(1000, () => req.destroy());
    req.on("error", () => resolve(false));
  });
  return { child, ready, env: config.env };
}
module.exports = { configuration, start };
