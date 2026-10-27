"use strict";
const reads = new Set([
  "chat-get",
  "chat-list",
  "bookmark-list",
  "collection-list",
  "alert-list",
  "physical/state",
]);
const transient = new Set([
  "state_unavailable",
  "state_timeout",
  "logical_turn_in_progress",
  "state_lease_lost",
  "state_version_conflict",
]);
const contention = new Set([
  "logical_turn_in_progress",
  "state_version_conflict",
]);
function pause(signal, milliseconds = 250) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
async function withReadRetry(operation, send, signal) {
  for (let attempt = 0; attempt < 4; attempt++) {
    signal?.throwIfAborted();
    try {
      return await send();
    } catch (error) {
      signal?.throwIfAborted();
      if (
        (contention.has(error?.code) ? attempt >= 3 : attempt >= 1) ||
        !reads.has(operation) ||
        !(
          transient.has(error?.code) ||
          (operation === "physical/state" &&
            ["physical_read_unavailable", "catalog_cancelled"].includes(
              error?.code,
            ))
        ) ||
        signal?.aborted
      )
        throw error;
      // A departing route's read can still be releasing its paced cloud lease.
      // At most three one-second backoffs; reads retain server deadlines and caller cancellation.
      // Never replay writes or return a previously read payload.
      await pause(signal, contention.has(error?.code) ? 1000 : 250);
    }
  }
}
module.exports = { withReadRetry };
