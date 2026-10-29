"use strict";
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises"),
  path = require("node:path");
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    v,
  );
const exact = (v, keys) =>
  v &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  Object.keys(v).sort().join() === [...keys].sort().join();
const kinds = ["collection_items", "price_alerts"];
function condition(c) {
  if (
    !exact(c, ["kind", "description", "grade_company", "grade"]) ||
    !["unspecified", "raw", "graded"].includes(c.kind)
  )
    fail("invalid_personal_request");
  if (c.kind === "raw") {
    if (
      ![
        "unknown",
        "near_mint",
        "lightly_played",
        "moderately_played",
        "heavily_played",
        "damaged",
      ].includes(c.description) ||
      c.grade_company !== null ||
      c.grade !== null
    )
      fail("invalid_personal_request");
  } else if (c.kind === "graded") {
    if (
      c.description !== null ||
      typeof c.grade_company !== "string" ||
      !c.grade_company.trim() ||
      c.grade_company.length > 40 ||
      typeof c.grade !== "string" ||
      !c.grade.trim() ||
      c.grade.length > 20
    )
      fail("invalid_personal_request");
  } else if (
    c.description !== null ||
    c.grade_company !== null ||
    c.grade !== null
  )
    fail("invalid_personal_request");
  return {
    kind: c.kind,
    description: c.description,
    grade_company: c.grade_company?.trim() || null,
    grade: c.grade?.trim() || null,
  };
}
const digest = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
function createPersonalFileStore({ directory }) {
  const root = path.resolve(directory);
  const file = (owner, kind, id) => {
    if (!/^[a-f0-9]{64}$/.test(owner) || !kinds.includes(kind) || !uuid(id))
      fail("invalid_personal_request");
    return path.join(root, owner, kind, id + ".json");
  };
  return {
    async get(o, k, id) {
      try {
        const record = JSON.parse(await fs.readFile(file(o, k, id), "utf8"));
        if (record?.id !== id) fail("state_unavailable");
        return record;
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
    },
    async put(o, k, id, v) {
      const target = file(o, k, id),
        data = JSON.stringify(v);
      if (Buffer.byteLength(data) > 16384) fail("state_storage_limit");
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const temp = target + "." + require("node:crypto").randomUUID() + ".tmp";
      try {
        await fs.writeFile(temp, data, { flag: "wx", mode: 0o600 });
        await fs.rename(temp, target);
      } finally {
        await fs.rm(temp, { force: true });
      }
    },
    async list(o, k) {
      file(o, k, "00000000-0000-4000-8000-000000000000");
      let names;
      try {
        names = await fs.readdir(path.join(root, o, k));
      } catch (e) {
        if (e.code === "ENOENT") return [];
        throw e;
      }
      const records = [];
      for (const name of names)
        if (name.endsWith(".json") && uuid(name.slice(0, -5))) {
          if (records.length >= 100) fail("state_storage_limit");
          records.push(await this.get(o, k, name.slice(0, -5)));
        }
      return records;
    },
    async delete(o, k, id) {
      await fs.rm(file(o, k, id), { force: true });
    },
  };
}
function createPersonalService({
  authenticate,
  store,
  getCard,
  now = Date.now,
  retentionMs = 86400000,
}) {
  const locks = new Set();
  async function owner(ctx) {
    const p = await authenticate(ctx);
    if (!p || typeof p.id !== "string" || !p.id || p.id.length > 200)
      fail("collector_caller_denied");
    return createHash("sha256").update(p.id).digest("hex");
  }
  async function locked(ctx, fn) {
    const o = await owner(ctx);
    if (locks.has(o)) fail("logical_turn_in_progress");
    locks.add(o);
    try {
      return await fn(o);
    } finally {
      locks.delete(o);
    }
  }
  function stored(r, k) {
    if (r === null) return null;
    try {
      const extra =
        k === "collection_items"
          ? ["quantity", "notes", "ownership_attested"]
          : [
              "market",
              "currency",
              "threshold_minor",
              "monitoring_consent",
              "basis",
              "unit_id",
              "evaluation_status",
            ];
      if (
        !exact(r, [
          "schema",
          "id",
          "card_id",
          "condition",
          ...extra,
          "source",
          "ownership_verified",
          "transaction_verified",
          "version",
          "createdAt",
          "updatedAt",
          "expiresAt",
          "input_sha256",
        ]) ||
        !uuid(r.id) ||
        !validCardId(r.card_id) ||
        r.schema !==
          (k === "collection_items"
            ? "pokemon.personal-collection.v1"
            : "pokemon.price-alert-preference.v1") ||
        r.source !== "user_reported" ||
        r.ownership_verified !== false ||
        r.transaction_verified !== false ||
        !Number.isSafeInteger(r.version) ||
        r.version < 0 ||
        ![r.createdAt, r.updatedAt, r.expiresAt].every(Number.isFinite) ||
        r.updatedAt < r.createdAt ||
        r.expiresAt <= r.createdAt ||
        r.expiresAt > r.createdAt + retentionMs
      )
        throw Error();
      const p = {
        id: r.id,
        ...(r.version ? { version: r.version - 1 } : { card_id: r.card_id }),
        condition: r.condition,
        ...Object.fromEntries(
          extra
            .filter(
              (k) => !["basis", "unit_id", "evaluation_status"].includes(k),
            )
            .map((k) => [k, r[k]]),
        ),
      };
      const v = input(p, k, r.version > 0);
      const h = digest({
        id: r.id,
        ...(r.version ? { version: r.version - 1 } : { card_id: r.card_id }),
        ...v,
      });
      if (
        h !== r.input_sha256 ||
        (k === "price_alerts" &&
          (r.basis !== "listing_ask" ||
            r.unit_id !== null ||
            r.evaluation_status !== "paused_requires_verified_feed_and_unit"))
      )
        throw Error();
      return r;
    } catch {
      fail("state_unavailable");
    }
  }
  async function list(o, k) {
    return (await store.list(o, k))
      .map((r) => stored(r, k))
      .filter((r) => r && r.expiresAt > now())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }
  const validCardId = (v) =>
    typeof v === "string" &&
    v.length <= 240 &&
    /^(ja|en):[^\s:|]+:[^\s:|]+:[^\s:|]+$/.test(v);
  function input(p, kind, update) {
    const fields =
      kind === "collection_items"
        ? ["quantity", "notes", "ownership_attested"]
        : ["market", "currency", "threshold_minor", "monitoring_consent"];
    if (
      !exact(p, [
        "id",
        ...(update ? ["version"] : ["card_id"]),
        "condition",
        ...fields,
      ]) ||
      !uuid(p.id) ||
      (!update && !validCardId(p.card_id)) ||
      (update && (!Number.isSafeInteger(p.version) || p.version < 0))
    )
      fail("invalid_personal_request");
    const c = condition(p.condition);
    if (kind === "collection_items") {
      if (
        !Number.isSafeInteger(p.quantity) ||
        p.quantity < 1 ||
        p.quantity > 999 ||
        typeof p.notes !== "string" ||
        p.notes.length > 1000 ||
        p.ownership_attested !== true
      )
        fail("invalid_personal_request");
      return {
        condition: c,
        quantity: p.quantity,
        notes: p.notes.trim(),
        ownership_attested: true,
      };
    }
    if (
      !["JP", "HK", "US"].includes(p.market) ||
      !["JPY", "HKD", "USD"].includes(p.currency) ||
      !Number.isSafeInteger(p.threshold_minor) ||
      p.threshold_minor <= 0 ||
      p.threshold_minor > 1000000000 ||
      p.monitoring_consent !== true
    )
      fail("invalid_personal_request");
    return {
      condition: c,
      market: p.market,
      currency: p.currency,
      threshold_minor: p.threshold_minor,
      monitoring_consent: true,
    };
  }
  async function save(ctx, p, options, kind, update) {
    const values = input(p, kind, update),
      hash = digest({
        id: p.id,
        ...(update ? { version: p.version } : { card_id: p.card_id }),
        ...values,
      });
    return locked(ctx, async (o) => {
      const existing = stored(await store.get(o, kind, p.id), kind);
      if (
        existing &&
        existing.expiresAt > now() &&
        existing.input_sha256 === hash
      )
        return existing;
      if (update && (!existing || existing.expiresAt <= now()))
        fail("personal_not_found");
      if (update && existing.version !== p.version)
        fail("personal_version_conflict");
      if (!update && existing) fail("personal_id_conflict");
      if (!update && (await list(o, kind)).length >= 100)
        fail("personal_limit");
      const cardId = update ? existing.card_id : p.card_id;
      // This is a current exact read, never a client-supplied card title or cached bookmark.
      const detail = await getCard(cardId, options?.signal);
      if (detail?.card?.card_id !== cardId)
        fail("invalid_live_catalog_response");
      const time = now(),
        record = {
          schema:
            kind === "collection_items"
              ? "pokemon.personal-collection.v1"
              : "pokemon.price-alert-preference.v1",
          id: p.id,
          card_id: cardId,
          ...values,
          source: "user_reported",
          ownership_verified: false,
          transaction_verified: false,
          version: update ? existing.version + 1 : 0,
          createdAt: update ? existing.createdAt : time,
          updatedAt: time,
          expiresAt: update ? existing.expiresAt : time + retentionMs,
          input_sha256: hash,
          ...(kind === "price_alerts"
            ? {
                basis: "listing_ask",
                unit_id: null,
                evaluation_status: "paused_requires_verified_feed_and_unit",
              }
            : {}),
        };
      await store.put(o, kind, p.id, record);
      // Read back to expose the actual stored expiry after a bounded cloud clamp.
      return stored(await store.get(o, kind, p.id), kind);
    });
  }
  async function remove(ctx, p, kind) {
    if (
      !exact(p, ["id", "version"]) ||
      !uuid(p.id) ||
      !Number.isSafeInteger(p.version) ||
      p.version < 0
    )
      fail("invalid_personal_request");
    return locked(ctx, async (o) => {
      const r = stored(await store.get(o, kind, p.id), kind);
      if (r && r.version !== p.version) fail("personal_version_conflict");
      if (r) await store.delete(o, kind, p.id);
      return { removed: true };
    });
  }
  const service = {};
  for (const [prefix, kind] of [
    ["collection", "collection_items"],
    ["alert", "price_alerts"],
  ]) {
    service[prefix + "List"] = async (ctx, p) => {
      if (!exact(p, [])) fail("invalid_personal_request");
      const o = await owner(ctx);
      return list(o, kind);
    };
    service[prefix + "Add"] = (ctx, p, opts) => save(ctx, p, opts, kind, false);
    service[prefix + "Update"] = (ctx, p, opts) =>
      save(ctx, p, opts, kind, true);
    service[prefix + "Remove"] = (ctx, p) => remove(ctx, p, kind);
  }
  return service;
}
module.exports = { createPersonalFileStore, createPersonalService, condition };
