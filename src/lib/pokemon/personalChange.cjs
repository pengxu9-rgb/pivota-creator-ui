"use strict";
function validatePersonalList(records, kind) {
  if (!Array.isArray(records) || records.length > 100)
    throw Error("Invalid personal records.");
  const ids = new Set();
  for (const r of records) {
    if (
      !r ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        r.id,
      ) ||
      ids.has(r.id) ||
      typeof r.card_id !== "string" ||
      !/^(ja|en):[^\s:|]+:[^\s:|]+:[^\s:|]+$/.test(r.card_id) ||
      !Number.isSafeInteger(r.version) ||
      r.version < 0 ||
      r.source !== "user_reported" ||
      r.ownership_verified !== false ||
      r.transaction_verified !== false ||
      !Number.isFinite(r.expiresAt) ||
      !r.condition ||
      !["unspecified", "raw", "graded"].includes(r.condition.kind)
    )
      throw Error("Invalid personal records.");
    if (
      kind === "collection"
        ? r.schema !== "pokemon.personal-collection.v1" ||
          !Number.isSafeInteger(r.quantity) ||
          r.quantity < 1 ||
          r.quantity > 999 ||
          typeof r.notes !== "string" ||
          r.notes.length > 1000 ||
          r.ownership_attested !== true
        : r.schema !== "pokemon.price-alert-preference.v1" ||
          !Number.isSafeInteger(r.threshold_minor) ||
          r.threshold_minor <= 0 ||
          !["JPY", "USD", "HKD"].includes(r.currency) ||
          !["JP", "US", "HK"].includes(r.market) ||
          r.monitoring_consent !== true ||
          r.unit_id !== null ||
          r.evaluation_status !== "paused_requires_verified_feed_and_unit"
    )
      throw Error("Invalid personal records.");
    ids.add(r.id);
  }
  return records;
}
async function changePersonal({
  api,
  operation,
  payload,
  listOperation,
  confirmed,
}) {
  let writeError;
  try {
    await api(operation, payload);
  } catch (e) {
    writeError = e;
  }
  try {
    const records = await api(listOperation, {});
    validatePersonalList(
      records,
      listOperation.startsWith("collection-") ? "collection" : "alert",
    );
    const applied = confirmed(records);
    return {
      records,
      confirmed: applied,
      unverified: false,
      error: applied
        ? null
        : new Error(
            "The change was not confirmed. Current records have been refreshed.",
            { cause: writeError },
          ),
    };
  } catch {
    return {
      records: null,
      confirmed: false,
      unverified: true,
      error: new Error(
        "Could not verify your records. Reload before continuing.",
      ),
    };
  }
}
module.exports = { changePersonal, validatePersonalList };
