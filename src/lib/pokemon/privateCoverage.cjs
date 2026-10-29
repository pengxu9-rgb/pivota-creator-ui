"use strict";
// Server-only snapshot reader. The principal is overwritten by the existing
// IAP-verifying private beta gateway; this header is not standalone authentication.
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { betaScope } = require("./betaScope.cjs");
const SNAPSHOT = "/app/private-coverage/snapshot.json";
const HASH = "/app/private-coverage/snapshot.sha256";
const MAX_BYTES = 128 * 1024;
const CATALOG_KEYS = ["source_records", "language_sets", "primary_with_recorded_copy", "missing_primary", "held_primary"];
const OFFER_KEYS = ["distinct_listings", "current_active_listings", "unique_sellers", "claimed_product_price_groups", "authorized_copy_photo_listings", "front_back_photo_listings"];
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const keys = (v, expected) => object(v) && Object.keys(v).sort().join() === [...expected].sort().join();
const count = v => v === null || Number.isSafeInteger(v) && v >= 0;
const text = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);

function coveragePageAllowed(env = process.env, principal) {
  try { return !!betaScope(env) && typeof principal === "string" && /^[a-f0-9]{64}$/.test(principal); }
  catch { return false; }
}

function validateSnapshot(value) {
  if (!keys(value, ["schema", "status", "report_date", "catalog", "cohort", "offers", "safeguards"]) ||
      value.schema !== "pot.private-coverage-snapshot.v1" || !["available", "unavailable"].includes(value.status) ||
      !(value.report_date === null || /^\d{4}-\d{2}-\d{2}$/.test(value.report_date) && new Date(value.report_date + "T00:00:00Z").toISOString().slice(0, 10) === value.report_date) ||
      !keys(value.catalog, CATALOG_KEYS) || !Object.values(value.catalog).every(count) ||
      !keys(value.safeguards, ["marketplace_reads_enabled", "orders_enabled", "payments_enabled"]) ||
      Object.values(value.safeguards).some(v => v !== false) ||
      !keys(value.cohort, ["basis", "next_wave_samples", "cards"]) ||
      value.cohort.basis !== "retained_acceptance_targets" || !count(value.cohort.next_wave_samples) ||
      !Array.isArray(value.cohort.cards) || value.cohort.cards.length > 100 ||
      !keys(value.offers, ["status", "metrics"]) || !["not_ingested", "evaluated", "evaluated_empty"].includes(value.offers.status) ||
      !keys(value.offers.metrics, OFFER_KEYS) || !Object.values(value.offers.metrics).every(count)) throw Error("invalid_coverage_snapshot");
  if (value.status === "available" && (value.report_date === null || Object.values(value.catalog).some(v => v === null))) throw Error("invalid_coverage_snapshot");
  if (value.status === "unavailable" && (value.report_date !== null || Object.values(value.catalog).some(v => v !== null) || value.cohort.cards.length || value.cohort.next_wave_samples !== null || value.offers.status !== "not_ingested")) throw Error("invalid_coverage_snapshot");
  if (value.offers.status === "not_ingested" && Object.values(value.offers.metrics).some(v => v !== null)) throw Error("invalid_coverage_snapshot");
  if (value.offers.status === "evaluated_empty" && Object.values(value.offers.metrics).some(v => v !== 0 && v !== null)) throw Error("invalid_coverage_snapshot");
  if (value.status === "available" && value.catalog.source_records !== value.catalog.primary_with_recorded_copy + value.catalog.missing_primary + value.catalog.held_primary) throw Error("invalid_coverage_snapshot");
  const ids = new Set();
  for (const card of value.cohort.cards) {
    if (!keys(card, ["card_id", "name", "language", "set_code", "collector_number", "variant", "reference_image_status"]) ||
        !text(card.name, 200) || !["en", "ja"].includes(card.language) || !text(card.set_code, 100) || !text(card.collector_number, 100) || !text(card.variant, 100) ||
        [card.set_code, card.collector_number, card.variant].some(v => /[:\s|]/.test(v)) ||
        card.card_id !== [card.language, card.set_code, card.collector_number, card.variant].join(":") || ids.has(card.card_id) ||
        !["present", "missing", "held", "unknown"].includes(card.reference_image_status)) throw Error("invalid_coverage_snapshot");
    ids.add(card.card_id);
  }
  return value;
}

function readBounded(path, max, io) {
  const before = io.lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size < 1 || before.size > max) throw Error("invalid_coverage_file");
  const fd = io.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = io.fstatSync(fd);
    if (!opened.isFile() || opened.ino !== before.ino || opened.dev !== before.dev || opened.size !== before.size) throw Error("changed_coverage_file");
    const buffer = Buffer.alloc(max + 1);
    let total = 0, read;
    while ((read = io.readSync(fd, buffer, total, buffer.length - total, null)) > 0) {
      total += read;
      if (total > max) throw Error("oversized_coverage_file");
    }
    if (total !== before.size || io.fstatSync(fd).size !== total) throw Error("changed_coverage_file");
    return buffer.subarray(0, total);
  } finally { io.closeSync(fd); }
}

function loadCoverageSnapshot({ env = process.env, principal, io = fs } = {}) {
  if (!coveragePageAllowed(env, principal)) return null;
  try {
    const expected = readBounded(HASH, 65, io).toString("utf8").trim();
    if (!/^[a-f0-9]{64}$/.test(expected)) return null;
    const raw = readBounded(SNAPSHOT, MAX_BYTES, io);
    if (createHash("sha256").update(raw).digest("hex") !== expected) return null;
    const value = validateSnapshot(JSON.parse(raw.toString("utf8")));
    return value.status === "available" ? value : null;
  } catch { return null; }
}

module.exports = { coveragePageAllowed, validateSnapshot, loadCoverageSnapshot, SNAPSHOT, HASH, MAX_BYTES, CATALOG_KEYS, OFFER_KEYS };
