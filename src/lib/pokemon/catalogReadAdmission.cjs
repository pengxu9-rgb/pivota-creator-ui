"use strict";
const key = Symbol.for("pivota.pokemon.catalog.read-admission.v1");
function createReadAdmission({ maxQueued = 32 } = {}) {
  if (!Number.isSafeInteger(maxQueued) || maxQueued < 1 || maxQueued > 32)
    throw new Error("invalid_catalog_admission");
  const queue = [];
  let active = false;
  function drain() {
    if (active || !queue.length) return;
    const job = queue.shift();
    job.signal?.removeEventListener("abort", job.abort);
    active = true;
    void (async () => {
      try {
        job.signal?.throwIfAborted();
        job.resolve(await job.operation());
      } catch (error) {
        job.reject(error);
      } finally {
        active = false;
        drain();
      }
    })();
  }
  return {
    run(operation, signal) {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(signal.reason);
        if (queue.length >= maxQueued)
          return reject(
            Object.assign(new Error("catalog_busy"), { code: "catalog_busy" }),
          );
        const job = { operation, signal, resolve, reject, abort: null };
        job.abort = () => {
          const index = queue.indexOf(job);
          if (index >= 0) queue.splice(index, 1);
          signal.removeEventListener("abort", job.abort);
          reject(signal.reason);
        };
        queue.push(job);
        signal?.addEventListener("abort", job.abort, { once: true });
        if (signal?.aborted) job.abort();
        drain();
      });
    },
  };
}
function catalogFetch(
  baseUrl,
  input,
  options = {},
  fetchImpl = globalThis.fetch,
) {
  const url = new URL(input);
  if (
    url.origin !== baseUrl ||
    ![
      "/catalog-status",
      "/catalog-search",
      "/catalog-card",
      "/units",
      "/offers",
      "/collector-journey",
      "/collector-inventory",
      "/card-comparison",
    ].includes(url.pathname)
  )
    throw new Error("invalid_catalog_transport");
  const gates = globalThis[key] || (globalThis[key] = new Map());
  if (!gates.has(baseUrl)) gates.set(baseUrl, createReadAdmission());
  // The existing backend releases its compute slot before response delivery.
  // Waiting for response headers coordinates compute without caching response data.
  return gates
    .get(baseUrl)
    .run(() => fetchImpl(input, options), options.signal);
}
module.exports = { createReadAdmission, catalogFetch };
