"use strict";
const key = Symbol.for("pivota.pokemon.state.request-admission.v1");
const fail = (code) => Object.assign(new Error(code), { code });

// Coordinate complete owner-state operations, including lease cleanup. This
// queues the original request once; it never replays a write or retains a result.
function createStateRequestAdmission({
  maxQueuedPerOwner = 8,
  maxOwners = 128,
  now = Date.now,
} = {}) {
  if (
    !Number.isSafeInteger(maxQueuedPerOwner) ||
    maxQueuedPerOwner < 1 ||
    maxQueuedPerOwner > 8 ||
    !Number.isSafeInteger(maxOwners) ||
    maxOwners < 1 ||
    maxOwners > 128
  )
    throw fail("invalid_state_admission");
  const owners = new Map();
  const clear = (job) => {
    clearTimeout(job.timer);
    job.signal?.removeEventListener("abort", job.abort);
  };
  function drain(owner, gate) {
    if (gate.active) return;
    const job = gate.queue.shift();
    if (!job) {
      owners.delete(owner);
      return;
    }
    clear(job);
    gate.active = true;
    void (async () => {
      try {
        if (job.signal?.aborted) throw fail("catalog_cancelled");
        if (job.deadline <= now()) throw fail("state_timeout");
        job.resolve(await job.operation());
      } catch (error) {
        job.reject(error);
      } finally {
        gate.active = false;
        drain(owner, gate);
      }
    })();
  }
  return {
    run(owner, operation, signal, deadline) {
      if (
        !/^[a-f0-9]{64}$/.test(owner) ||
        typeof operation !== "function" ||
        !Number.isFinite(deadline)
      )
        return Promise.reject(fail("invalid_state_admission"));
      if (signal?.aborted) return Promise.reject(fail("catalog_cancelled"));
      if (deadline <= now()) return Promise.reject(fail("state_timeout"));
      let gate = owners.get(owner);
      if (!gate) {
        if (owners.size >= maxOwners)
          return Promise.reject(fail("logical_turn_in_progress"));
        gate = { active: false, queue: [] };
        owners.set(owner, gate);
      }
      if (gate.queue.length >= maxQueuedPerOwner)
        return Promise.reject(fail("logical_turn_in_progress"));
      return new Promise((resolve, reject) => {
        const job = { operation, signal, deadline, resolve, reject };
        const remove = (code) => {
          const index = gate.queue.indexOf(job);
          if (index < 0) return;
          gate.queue.splice(index, 1);
          clear(job);
          reject(fail(code));
          if (!gate.active && !gate.queue.length) owners.delete(owner);
        };
        job.abort = () => remove("catalog_cancelled");
        job.timer = setTimeout(
          () => remove("state_timeout"),
          Math.max(1, deadline - now()),
        );
        gate.queue.push(job);
        signal?.addEventListener("abort", job.abort, { once: true });
        if (signal?.aborted) job.abort();
        drain(owner, gate);
      });
    },
  };
}
function withStateRequestAdmission(owner, operation, signal, deadline) {
  const admission =
    globalThis[key] || (globalThis[key] = createStateRequestAdmission());
  return admission.run(owner, operation, signal, deadline);
}
module.exports = { createStateRequestAdmission, withStateRequestAdmission };
