"use strict";
// Offline projection only. Input file paths and raw evidence never enter the
// runtime snapshot. No fetching, approval, order or payment code is imported.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { validateSnapshot, OFFER_KEYS } = require("../src/lib/pokemon/privateCoverage.cjs");

function project({ cohort, images, offers, date }) {
  if (cohort?.schema !== "pot.focused-card-coverage.v1" || images?.schema !== "pot.offline-reference-image-inventory.v1" || offers?.schema !== "pokemon.offer-photo-coverage.v1" ||
      !cohort.catalog || cohort.catalog.records !== images.catalog_records || !/^[a-f0-9]{64}$/.test(cohort.catalog.sha256 || "") ||
      !Object.values(images.input_sha256 || {}).includes(cohort.catalog.sha256) ||
      cohort.safeguards?.catalog_read_only !== true || cohort.safeguards?.network_calls !== 0 || cohort.safeguards?.marketplace_calls !== 0 || cohort.safeguards?.permissions_added !== 0 ||
      images.live_calls !== 0 || images.catalog_writes !== 0 || offers.orders_enabled !== false || offers.payments_enabled !== false ||
      offers.live_coverage_verified !== false || offers.authenticity_verified !== false || offers.source_access_authorized !== false ||
      !Array.isArray(cohort.rows) || !Array.isArray(cohort.next_wave?.entries)) throw Error("invalid_coverage_inputs");
  const counts = images.record_counts;
  if (!counts || Object.keys(counts).some(key => !["current_primary_recorded_copy", "missing", "held"].includes(key))) throw Error("unsupported_image_inventory_state");
  const cards = cohort.rows.map(row => {
    const identity = row.identity, image = row.primary_image;
    if (!identity || !image || row.catalog_status !== "exact_record_present") throw Error("invalid_priority_card");
    return { card_id: row.card_id, name: identity.name, language: identity.language, set_code: identity.set_code,
      collector_number: identity.collector_number, variant: identity.variant,
      reference_image_status: image.status === "current" && image.current_endpoint === true ? "present" : image.status === "missing" ? "missing" : image.status === "held" ? "held" : "unknown" };
  });
  // Set counts are explicit input facts; record count cannot be used to infer
  // number of sets, usable images, sellers or physical cards.
  const sets = cohort.catalog.language_sets;
  if (!Number.isSafeInteger(sets) || sets < 0) throw Error("catalog_language_set_count_required");
  return validateSnapshot({ schema: "pot.private-coverage-snapshot.v1", status: "available", report_date: date,
    catalog: { source_records: images.catalog_records, language_sets: sets,
      primary_with_recorded_copy: counts.current_primary_recorded_copy || 0, missing_primary: counts.missing || 0, held_primary: counts.held || 0 },
    cohort: { basis: "retained_acceptance_targets", next_wave_samples: cohort.next_wave.entries.length, cards },
    offers: { status: offers.inventory_status, metrics: Object.fromEntries(OFFER_KEYS.map(key => [key, offers.metrics?.[key]])) },
    safeguards: { marketplace_reads_enabled: false, orders_enabled: false, payments_enabled: false } });
}

function readJson(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024) throw Error("invalid_report_file");
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!["--cohort", "--images", "--offers", "--catalog-status", "--date", "--out"].includes(argv[i]) || !argv[i + 1] || options[argv[i]]) throw Error("use explicit report paths, date and new output directory");
    options[argv[i]] = argv[i + 1];
  }
  if (Object.keys(options).length !== 6) throw Error("all six options are required");
  const cohort = readJson(options["--cohort"]), images = readJson(options["--images"]), offers = readJson(options["--offers"]);
  const statusReport = readJson(options["--catalog-status"]);
  const catalog = statusReport.requests?.[0]?.body;
  if (!catalog || catalog.printings !== cohort.catalog?.records || statusReport.database_sha256 !== cohort.catalog?.sha256) throw Error("catalog_status_binding_mismatch");
  // Copy an explicit measured count into the projection; original files stay read-only.
  cohort.catalog.language_sets = catalog.sets;
  const snapshot = project({ cohort, images, offers, date: options["--date"] });
  const bytes = Buffer.from(JSON.stringify(snapshot, null, 2) + "\n");
  const output = path.resolve(options["--out"]);
  fs.mkdirSync(output, { recursive: false });
  fs.writeFileSync(path.join(output, "snapshot.json"), bytes, { flag: "wx" });
  fs.writeFileSync(path.join(output, "snapshot.sha256"), createHash("sha256").update(bytes).digest("hex") + "\n", { flag: "wx" });
  console.log(JSON.stringify({ schema: snapshot.schema, report_date: snapshot.report_date, priority_cards: snapshot.cohort.cards.length, inventory_status: snapshot.offers.status, network_calls: 0 }));
}

if (require.main === module) main(process.argv.slice(2));
module.exports = { project };
