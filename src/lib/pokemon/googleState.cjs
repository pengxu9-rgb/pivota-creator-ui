"use strict";
const { PRIVATE_WORK_MS, PRIVATE_HARD_MS, PRIVATE_LEASE_MS } = require("./requestBudgets.cjs");
const { AsyncLocalStorage } = require("node:async_hooks");
const { cloudTestScope, TEST_BUCKET } = require("./cloudTestScope.cjs");
const { createHash, randomUUID } = require("node:crypto");
const { createGoogleObjectBackend } = require("./googleObjectBackend.cjs");
const { betaScope, RETENTION_MS } = require("./betaScope.cjs");
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    value,
  );
const BUCKET = "pivota-staging-pokemon-creator-demo-184498324954";
function stateConfiguration(env = process.env, now = Date.now()) {
  const beta=betaScope(env);
  if(beta)return {scope:"beta",bucket:beta.bucket,namespace:beta.namespace,
    expiresAt:Infinity,retentionMs:beta.retentionMs,ioMs:8000,rateLimitRetryMs:1000,mutationIntervalMs:1000};
  const driver = env.POKEMON_CREATOR_STATE_DRIVER || "local";
  if (driver === "local") {
    if (env.K_SERVICE) fail("invalid_state_configuration");
    return null;
  }
  const started = Date.parse(env.POKEMON_CREATOR_STATE_STARTED_AT),
    expires = Date.parse(env.POKEMON_CREATOR_STATE_EXPIRES_AT);
  if (
    !Number.isFinite(started) ||
    !Number.isFinite(expires) ||
    expires <= started ||
    expires - started > 86400000 ||
    started > now ||
    expires <= now ||
    !/^[a-z0-9-]{3,60}$/.test(env.POKEMON_CREATOR_STATE_NAMESPACE || "")
  )
    fail("invalid_state_configuration");
  const testScope = cloudTestScope(env, now);
  const bucket = testScope ? TEST_BUCKET : BUCKET;
  if (env.POKEMON_CREATOR_STATE_BUCKET !== bucket)
    fail("invalid_state_configuration");
  if (driver === "gcs") {
    if (
      (env.K_SERVICE !== "pokemon-commerce-index" && !testScope) ||
      env.POKEMON_CREATOR_GOOGLE_ONLY !== "true" ||
      env.GOOGLE_CLOUD_PROJECT !== "pivota-staging" ||
      env.POKEMON_CREATOR_STATE_ENDPOINT
    )
      fail("invalid_state_configuration");
    return {
      bucket,
      namespace: env.POKEMON_CREATOR_STATE_NAMESPACE,
      startedAt: started,
      expiresAt: expires,
      ...(testScope
        ? { rateLimitRetryMs: 1000, mutationIntervalMs: 1000, ioMs: 8000 }
        : {}),
    };
  }
  if (
    driver === "mock-gcs" &&
    env.POKEMON_CREATOR_LOCAL_TEST === "true" &&
    !env.K_SERVICE
  ) {
    let url;
    try {
      url = new URL(env.POKEMON_CREATOR_STATE_ENDPOINT);
    } catch {
      fail("invalid_state_configuration");
    }
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !url.port ||
      url.pathname !== "/" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      fail("invalid_state_configuration");
    return {
      bucket: BUCKET,
      namespace: env.POKEMON_CREATOR_STATE_NAMESPACE,
      startedAt: started,
      expiresAt: expires,
      endpoint: url.origin,
      mock: true,
    };
  }
  fail("invalid_state_configuration");
}
function createDurableState({
  config,
  backend,
  onStorageFailure,
  now = Date.now,
  workMs = PRIVATE_WORK_MS,
  hardMs = PRIVATE_HARD_MS,
  leaseMs = PRIVATE_LEASE_MS,
  pollMs = 250,
}) {
  if (!(workMs < hardMs && hardMs + 2000 < leaseMs))
    fail("invalid_state_configuration");
  backend =
    backend ||
    createGoogleObjectBackend({
      ...config,
      onFailure: onStorageFailure,
      ...(config.mock ? { getToken: async () => null } : {}),
    });
  const scope = new AsyncLocalStorage(),
    active = new Map();
  const root = config.namespace + "/";
  const alive = () => {
    if (now() >= config.expiresAt) fail("state_expired");
  };
  const ownerFor = (session) => hash("owner-local-demo:" + session);
  const keyFor = (owner, kind, id) => {
    if (
      !/^[a-f0-9]{64}$/.test(owner) ||
      ![
        "workspaces",
        "chats",
        "bookmarks",
        "collection_items",
        "price_alerts",
      ].includes(kind) ||
      !uuid(id)
    )
      fail("invalid_private_workspace_request");
    return root + "owners/" + owner + "/" + kind + "/" + id + ".json";
  };
  const leaseKey = (owner) => root + "owners/" + owner + "/lease.json";
  async function fence() {
    const held = scope.getStore();
    if (!held) fail("state_lease_lost");
    alive();
    if (now() >= held.deadline) fail("state_timeout");
    const record = await backend.read(leaseKey(held.owner), held.deadline);
    if (
      !record ||
      record.value.id !== held.id ||
      record.value.expiresAt <= now()
    )
      fail("state_lease_lost");
    held.generation = record.generation;
    if (record.value.cancelled) {
      held.controller.abort();
      held.cancelled = true;
    }
    return held;
  }
  function store(kind) {
    async function read(owner, selected, id) {
      alive();
      const held = scope.getStore();
      if (!held || held.owner !== owner) fail("state_lease_lost");
      const key = keyFor(owner, selected, id),
        record = await backend.read(key, held.deadline);
      if (
        record &&
        ["collection_items", "price_alerts"].includes(selected) &&
        record.value?.id !== id
      )
        fail("state_unavailable");
      held.seen.set(key, record?.generation || "0");
      return record?.value || null;
    }
    async function write(owner, selected, id, value) {
      const held = await fence();
      if (held.owner !== owner) fail("state_lease_lost");
      // Cancelled work can write only its withdrawal/failure compensation.
      if (
        held.cancelled &&
        ((selected === "workspaces" &&
          (value.result ||
            value.session ||
            value.savedDecision ||
            !value.needsReconfirmation)) ||
          (selected === "chats" && !value.requiresReconfirmation) ||
          ["bookmarks", "collection_items", "price_alerts"].includes(selected))
      )
        fail("catalog_cancelled");
      if (
        Buffer.byteLength(JSON.stringify(value)) >
        (selected === "workspaces" ? 1048576 : 2097152)
      )
        fail("state_storage_limit");
      const key = keyFor(owner, selected, id);
      if (!held.seen.has(key)) await read(owner, selected, id);
      const copy = structuredClone(value);
      if (Number.isFinite(copy.expiresAt))
        copy.expiresAt = Math.min(copy.expiresAt, config.expiresAt);
      held.dirty = true;
      const generation = await backend.write(
        key,
        copy,
        held.seen.get(key),
        held.deadline,
      );
      held.seen.set(key, generation);
    }
    async function list(owner, selected) {
      alive();
      const held = scope.getStore();
      if (!held || held.owner !== owner) fail("state_lease_lost");
      const prefix = root + "owners/" + owner + "/" + selected + "/",
        keys = await backend.list(prefix, held.deadline),
        values = [];
      if (
        keys.length >
        (["bookmarks", "collection_items", "price_alerts"].includes(selected)
          ? 100
          : 50)
      )
        fail("state_storage_limit");
      for (const key of keys) {
        const id = key.slice(prefix.length, -5);
        if (key !== keyFor(owner, selected, id)) fail("state_unavailable");
        const value = await read(owner, selected, id);
        if (value) values.push(value);
      }
      return values;
    }
    async function remove(owner, selected, id) {
      const held = await fence();
      if (held.owner !== owner) fail("state_lease_lost");
      const key = keyFor(owner, selected, id);
      if (!held.seen.has(key)) await read(owner, selected, id);
      held.dirty = true;
      if (held.seen.get(key) !== "0")
        await backend.remove(key, held.seen.get(key), held.deadline);
      held.seen.set(key, "0");
      held.dirty = true;
    }
    return kind
      ? {
          get: (o, id) => read(o, kind, id),
          put: (o, id, v) => write(o, kind, id, v),
          list: (o) => list(o, kind),
          delete: (o, id) => remove(o, kind, id),
        }
      : { get: read, put: write, list, delete: remove };
  }
  const workspaceStore = store("workspaces"),
    conversationStore = store();
  async function withdraw(owner) {
    // Recovery never deletes bookmarks or message history. All target authority is withdrawn.
    for (const value of await workspaceStore.list(owner))
      await workspaceStore.put(owner, value.id, {
        ...value,
        version: value.version + 1,
        session: null,
        result: null,
        next_step: null,
        savedDecision: null,
        needsReconfirmation: true,
        confirmationInvalidatedByFailure: true,
      });
    for (const value of await conversationStore.list(owner, "chats"))
      await conversationStore.put(owner, "chats", value.id, {
        ...value,
        version: value.version + 1,
        requiresReconfirmation: true,
        commerceAnchor: null,
      });
  }
  async function run(
    owner,
    conversationId,
    operation,
    signal,
    requestDeadline = Infinity,
    cancellable = true,
  ) {
    alive();
    if (active.has(owner)) fail("logical_turn_in_progress");
    const deadline = Math.min(
      now() + hardMs,
      config.expiresAt,
      requestDeadline,
    );
    if (deadline <= now()) fail("state_timeout");
    const key = leaseKey(owner),
      old = await backend.read(key, deadline);
    if (deadline <= now()) fail("state_timeout");
    if (
      old &&
      (!uuid(old.value.id) ||
        !Number.isFinite(old.value.expiresAt) ||
        !["working", "committed"].includes(old.value.phase))
    )
      fail("state_unavailable");
    // A leftover committed lease can be an acknowledged write whose response was lost.
    // Keep all live leases exclusive; repair every expired leftover before exposing authority.
    if (old && old.value.expiresAt > now()) fail("logical_turn_in_progress");
    const held = {
      id: randomUUID(),
      owner,
      conversationId: uuid(conversationId) ? conversationId : null,
      controller: new AbortController(),
      seen: new Map(),
      deadline,
      cancelled: false,
    };
    const lease = {
      id: held.id,
      conversationId: held.conversationId,
      phase: "working",
      expiresAt: now() + leaseMs,
      cancelled: false,
      cancellable,
    };
    try {
      held.generation = await backend.write(
        key,
        lease,
        old?.generation || "0",
        held.deadline,
      );
    } catch (error) {
      if (error.code === "state_version_conflict")
        fail("logical_turn_in_progress");
      throw error;
    }
    active.set(owner, held);
    let timer,
      poll,
      stopped = false,
      polling;
    const abort = () => {
      held.cancelled = true;
      held.controller.abort();
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    return scope.run(held, async () => {
      let clean = false;
      try {
        if (old) {
          held.dirty = true;
          await withdraw(owner);
        }
        timer = setTimeout(
          abort,
          Math.max(1, Math.min(workMs, held.deadline - now() - 3000)),
        );
        const tick = () => {
          if (stopped) return;
          polling = fence()
            .catch(abort)
            .finally(() => {
              if (!stopped) poll = setTimeout(tick, pollMs);
            });
        };
        poll = setTimeout(tick, pollMs);
        const result = await operation(held.controller.signal);
        if (held.controller.signal.aborted) fail("catalog_cancelled");
        const latest = await backend.read(key, held.deadline);
        if (!latest || latest.value.id !== held.id) fail("state_lease_lost");
        if (latest.value.cancelled) fail("catalog_cancelled");
        // A remote cancellation either wins this CAS, or observes committed and returns false.
        try {
          held.generation = await backend.write(
            key,
            { ...latest.value, phase: "committed" },
            latest.generation,
            held.deadline,
          );
        } catch (error) {
          if (error.code === "state_version_conflict")
            fail("catalog_cancelled");
          throw error;
        }
        clean = true;
        return result;
      } catch (error) {
        abort();
        if (held.dirty) await withdraw(owner);
        clean = true;
        throw error;
      } finally {
        stopped = true;
        clearTimeout(timer);
        clearTimeout(poll);
        await polling;
        signal?.removeEventListener("abort", abort);
        active.delete(owner);
        // An unsuccessful repair leaves a working lease for next-owner recovery.
        if (clean) {
          try {
            const latest = await backend.read(key, held.deadline);
            if (latest?.value.id === held.id)
              await backend.remove(key, latest.generation, held.deadline);
          } catch {
            /* Expired lease still causes repair on the next operation. */
          }
        }
      }
    });
  }
  async function cancel(session, id, deadline = Infinity) {
    alive();
    if (!uuid(id)) fail("invalid_chat_request");
    const owner = ownerFor(session),
      key = leaseKey(owner),
      record = await backend.read(key, deadline);
    if (
      !record ||
      record.value.phase !== "working" ||
      record.value.cancellable === false ||
      record.value.expiresAt <= now() ||
      record.value.conversationId !== id
    )
      return { cancellation_requested: false };
    try {
      await backend.write(
        key,
        { ...record.value, cancelled: true },
        record.generation,
        deadline,
      );
    } catch (error) {
      if (error.code === "state_version_conflict")
        return { cancellation_requested: false };
      throw error;
    }
    active.get(owner)?.controller.abort();
    return { cancellation_requested: true };
  }
  async function validSession(id, deadline = Infinity) {
    if (!uuid(id)) return false;
    alive();
    deadline = Math.min(deadline, scope.getStore()?.deadline || Infinity);
    if (deadline <= now()) fail("state_timeout");
    const record = await backend.read(
      root + "sessions/" + hash(id) + ".json",
      deadline,
    );
    return (
      !!record &&
      Number.isFinite(record.value.expiresAt) &&
      record.value.expiresAt > now() &&
      record.value.expiresAt <= config.expiresAt
    );
  }
  async function createSession(deadline = Infinity, accountSession) {
    alive();
    if (deadline <= now()) fail("state_timeout");
    if(accountSession!==undefined&&(config.scope!=="beta"||!uuid(accountSession)))fail("collector_caller_denied");
    const id = accountSession || randomUUID();
    const key=root + "sessions/" + hash(id) + ".json";
    const old=accountSession?await backend.read(key,deadline):null;
    if(old&&(!old.value||Object.keys(old.value).join(",")!=="expiresAt"||!Number.isFinite(old.value.expiresAt)))fail("state_unavailable");
    if(old&&Number.isFinite(old.value?.expiresAt)&&old.value.expiresAt>now())return id;
    try{await backend.write(
      key,
      { expiresAt: Math.min(now() + (config.scope==="beta"?RETENTION_MS:86400000), config.expiresAt) },
      old?.generation || "0",
      deadline,
    );}catch(error){
      if(!accountSession||error.code!=="state_version_conflict")throw error;
      if(!(await validSession(id,deadline)))throw error;
    }
    return id;
  }
  function wrap(chats) {
    return Object.fromEntries(
      Object.entries(chats).map(([name, fn]) => [
        name,
        async (ctx, payload, options = {}) => {
          if (!(await validSession(ctx?.demoSession, options.deadline)))
            fail("collector_caller_denied");
          if (name === "cancel") {
            if (
              !payload ||
              Object.keys(payload).length !== 1 ||
              !Object.hasOwn(payload, "id")
            )
              fail("invalid_chat_request");
            const result=await cancel(ctx.demoSession, payload.id, options.deadline);
            if(result.cancellation_requested)return result;
            try{return await run(ownerFor(ctx.demoSession),payload.id,()=>fn(ctx,payload),options.signal,options.deadline,false);}catch(error){if(error.code==='logical_turn_in_progress')return {cancellation_requested:false};throw error;}
          }
          if (name === "withLocalFixture") {
            if (typeof options !== "function") fail("invalid_chat_request");
            return run(ownerFor(ctx.demoSession), payload?.id, (signal) =>
              fn(ctx, payload, (chat, localSignal) =>
                options(chat, AbortSignal.any([signal, localSignal])),
              ),
            );
          }
          return run(
            ownerFor(ctx.demoSession),
            payload?.id || payload?.conversation_id,
            (signal) => fn(ctx, payload, { signal }),
            options.signal,
            options.deadline,
            !['beginCommerce','finishCommerce','get'].includes(name),
          );
        },
      ]),
    );
  }
  return {
    workspaceStore,
    conversationStore,
    validSession,
    createSession,
    wrap,
    run,
    cancel,
    ownerFor,
  };
}
module.exports = { createDurableState, stateConfiguration, BUCKET };
