"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { createHash } = require("node:crypto");
const { coveragePageAllowed, validateSnapshot, loadCoverageSnapshot, SNAPSHOT, HASH, MAX_BYTES } = require("../src/lib/pokemon/privateCoverage.cjs");
const { pagePathAllowed } = require("../cloud/pokemon/runtime/page-path.cjs");
const { project } = require("../scripts/prepare-private-coverage.cjs");

function env() {
  const result = { K_SERVICE: "pot-beta-app", GOOGLE_CLOUD_PROJECT: "pivota-prod", POKEMON_CREATOR_BETA_MODE: "true", POKEMON_CREATOR_GOOGLE_ONLY: "true",
    POKEMON_CREATOR_STATE_DRIVER: "gcs", POKEMON_CREATOR_STATE_BUCKET: "pivota-prod-pot-beta-state-388293626878", POKEMON_CREATOR_STATE_NAMESPACE: "beta-v1",
    POKEMON_CREATOR_IMAGE_DRIVER: "gcs", POKEMON_CREATOR_IMAGE_BUCKET: "pivota-prod-pot-beta-media-388293626878", POKEMON_CREATOR_IMAGE_NAMESPACE: "ui-20261013-full-ea57651c",
    POKEMON_CREATOR_CATALOG_URL: "https://pokemon-commerce-index-beta-388293626878.us-west1.run.app", POKEMON_CREATOR_CATALOG_AUDIENCE: "https://pokemon-commerce-index-beta-gpx4jyrubq-uw.a.run.app" };
  for (const key of ["POKEMON_CREATOR_TEST_MODE", "POKEMON_CREATOR_SYNTHETIC_DEMO", "POKEMON_CREATOR_MANUAL_RESEARCH", "POKEMON_PHYSICAL_FIXTURE_ENABLED", "POKEMON_COMMERCE_MANAGED_SIDECAR", "POKEMON_COMMERCE_FIXTURE", "POKEMON_COMMERCE_CRAWL_ENABLED", "POKEMON_COMMERCE_BNS_ENABLED", "POKEMON_COMMERCE_PSA_ENABLED", "POKEMON_COMMERCE_BNS_URL_PREVIEW"]) result[key] = "false";
  return result;
}
const principal = "a".repeat(64);
function snapshot() {
  const value = JSON.parse(fs.readFileSync(path.join(__dirname, "../private-coverage/snapshot.json"), "utf8"));
  Object.assign(value, { status: "available", report_date: "2026-10-28" });
  Object.assign(value.catalog, { source_records: 10, language_sets: 2, primary_with_recorded_copy: 8, missing_primary: 1, held_primary: 1 });
  value.cohort.next_wave_samples = 2;
  value.cohort.cards = [{ card_id: "ja:TEST:001/001:normal", name: "Synthetic test card", language: "ja", set_code: "TEST", collector_number: "001/001", variant: "normal", reference_image_status: "missing" }];
  return value;
}
function withFiles(value, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pot-coverage-"));
  const file = path.join(root, "snapshot.json"), hash = path.join(root, "snapshot.sha256");
  const raw = JSON.stringify(value); fs.writeFileSync(file, raw); fs.writeFileSync(hash, createHash("sha256").update(raw).digest("hex") + "\n");
  const map = p => p === SNAPSHOT ? file : p === HASH ? hash : (() => { throw Error("unexpected path"); })();
  const io = { ...fs, lstatSync: p => fs.lstatSync(map(p)), openSync: (p, flags) => fs.openSync(map(p), flags) };
  try { fn({ root, file, hash, io }); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test("coverage requires the exact private beta and principal; denial happens before reading files", () => {
  assert.equal(coveragePageAllowed(env(), principal), true);
  for (const changed of [{}, { ...env(), K_SERVICE: "public-app" }, { ...env(), POKEMON_CREATOR_BETA_MODE: "false" },
    { ...env(), POKEMON_COMMERCE_CRAWL_ENABLED: "true" }, { ...env(), PSA_API_TOKEN: "" }, { ...env(), POKEMON_COMMERCE_URL: "http://127.0.0.1:8766" },
    { ...env(), POKEMON_CREATOR_STATE_NAMESPACE: "wrong" }, { ...env(), POKEMON_CREATOR_CATALOG_URL: "https://wrong.invalid" }]) {
    let read = false;
    assert.equal(loadCoverageSnapshot({ env: changed, principal, io: { lstatSync() { read = true; throw Error(); } } }), null);
    assert.equal(read, false);
  }
  for (const p of [undefined, "", "b".repeat(63), "A".repeat(64)]) assert.equal(coveragePageAllowed(env(), p), false);
});

test("runtime returns only valid bounded hash-bound regular files, never trusts a symlink or altered snapshot", () => {
  withFiles(snapshot(), ({ file, hash, io }) => {
    assert.equal(loadCoverageSnapshot({ env: env(), principal, io }).catalog.source_records, 10);
    fs.writeFileSync(hash, "0".repeat(64)); assert.equal(loadCoverageSnapshot({ env: env(), principal, io }), null);
    fs.writeFileSync(file, "x".repeat(MAX_BYTES + 1)); assert.equal(loadCoverageSnapshot({ env: env(), principal, io }), null);
  });
  withFiles(snapshot(), ({ root, file, io }) => {
    const target = path.join(root, "other.json"); fs.renameSync(file, target); fs.symlinkSync(target, file);
    assert.equal(loadCoverageSnapshot({ env: env(), principal, io }), null);
  });
  assert.equal(loadCoverageSnapshot({ env: env(), principal, io: { lstatSync() { throw Error("missing"); } } }), null);
});

test("neutral report stays unavailable, missing inventory stays null and an evaluated empty inventory can be zero", () => {
  const neutral = JSON.parse(fs.readFileSync(path.join(__dirname, "../private-coverage/snapshot.json"), "utf8"));
  assert.doesNotThrow(() => validateSnapshot(neutral));
  withFiles(neutral, ({ io }) => assert.equal(loadCoverageSnapshot({ env: env(), principal, io }), null));
  const value = snapshot(); validateSnapshot(value); assert.equal(value.offers.metrics.unique_sellers, null);
  value.offers.status = "evaluated_empty"; for (const key of Object.keys(value.offers.metrics)) value.offers.metrics[key] = 0;
  validateSnapshot(value); assert.equal(value.offers.metrics.unique_sellers, 0);
  value.offers.status = "not_ingested"; assert.throws(() => validateSnapshot(value));
});

test("schema rejects false source/order authority, inconsistent images, duplicate identities and private extra fields", () => {
  for (const mutate of [v => v.evidence_path = "/private/operator.json", v => v.safeguards.orders_enabled = true,
    v => v.safeguards.marketplace_reads_enabled = true, v => v.catalog.source_records++, v => v.cohort.cards.push(v.cohort.cards[0]),
    v => v.cohort.cards[0].card_id = "ja:WRONG:001/001:normal", v => v.catalog.source_records = -1,
    v => v.report_date = "2026-02-30", v => v.offers.metrics.unique_sellers = 0]) {
    const value = snapshot(); mutate(value); assert.throws(() => validateSnapshot(value));
  }
});

test("coverage route is exact and SSR source is dynamic without client imports or activation actions", () => {
  assert.equal(pagePathAllowed("/creator/pokemon-collector/coverage"), true);
  for (const url of ["/creator/pokemon-collector/coverage/", "/creator/pokemon-collector/coverage/private", "/creator/pokemon-collector/coverage?path=secret", "/api/coverage"]) assert.equal(pagePathAllowed(url), false);
  const page = fs.readFileSync(path.join(__dirname, "../src/app/creator/pokemon-collector/coverage/page.tsx"), "utf8");
  assert.match(page, /dynamic = "force-dynamic"/); assert.match(page, /revalidate = 0/);
  assert.ok(page.indexOf("coveragePageAllowed(process.env, principal)") < page.indexOf("loadCoverageSnapshot({ principal })"));
  assert.doesNotMatch(page, /["']use client["']|<form|fetch\(|snapshot\.json/);
});

test("offline converter projects explicit evidence only and strips paths/source records", () => {
  const cohort = { schema: "pot.focused-card-coverage.v1", catalog: { records: 10, sha256: "a".repeat(64), language_sets: 2 }, safeguards: { catalog_read_only: true, network_calls: 0, marketplace_calls: 0, permissions_added: 0 }, rows: [{ card_id: "ja:TEST:001/001:normal", catalog_status: "exact_record_present", identity: { language: "ja", set_code: "TEST", collector_number: "001/001", variant: "normal", name: "Synthetic test card" }, primary_image: { status: "current", current_endpoint: true, source_ref: "https://private.invalid/secret" } }], next_wave: { entries: [] }, private_path: "/operator/private.json" };
  const images = { schema: "pot.offline-reference-image-inventory.v1", catalog_records: 10, record_counts: { current_primary_recorded_copy: 8, missing: 1, held: 1 }, input_sha256: { "/operator/catalog.sqlite3": "a".repeat(64) }, live_calls: 0, catalog_writes: 0 };
  const offers = { schema: "pokemon.offer-photo-coverage.v1", inventory_status: "not_ingested", metrics: snapshot().offers.metrics, orders_enabled: false, payments_enabled: false, live_coverage_verified: false, authenticity_verified: false, source_access_authorized: false };
  const value = project({ cohort, images, offers, date: "2026-10-28" });
  assert.equal(value.cohort.cards[0].reference_image_status, "present");
  assert.doesNotMatch(JSON.stringify(value), /private\.invalid|operator|source_ref|sqlite3/);
  assert.throws(() => project({ cohort, images: { ...images, live_calls: 1 }, offers, date: "2026-10-28" }));
  assert.throws(() => project({ cohort, images: { ...images, input_sha256: {} }, offers, date: "2026-10-28" }));
});
