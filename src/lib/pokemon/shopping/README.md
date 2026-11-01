# Offline shopping prototype

This test/evaluation-only prototype implements shopping.v1 with synthetic data.
It has no production entry point, source connection, model transport, credentials,
orders or payments outside its in-process simulator. Every listing URL is under
example.invalid. A simulator result is never evidence of a real purchase.

The twelve model-callable schemas and seven trusted-only operation schemas are
the authority inventory. Unknown request fields fail closed. Authentication is
host-issued; a role in model arguments is never a principal. Approval, payment
link creation, completion, after-sales, reconciliation, same-key replay and human
recovery are not model functions. During execution/recovery the model can only
read the operation/order, and cannot retime, unlock or replace it.

Read-only exploration returns labeled assumptions and current fixture evidence.
It never writes accepted requirements, saves a target, creates a quote or invokes
the native parser with corrected text. All mutations pass shoppingAdmission.cjs.
The reviewed kernel, holds and native adapter remain unchanged.

## Ledger transaction contract

The memory adapter must serialize a task mutation and publish one complete
copy-on-write state, or publish nothing on failure. Idempotency lookup is scoped
by tenant, app, user, task, operation type and request ID. Store the semantic
payload hash separately; a changed payload conflicts. Identical retries return
the existing result even if their expected version changed.

Trusted approval must, in one transaction: validate current terms and human
action; create approval; reserve its execution; consume approval for that
operation; insert the durable dispatch/outbox record; and store the provider key.
Neither a model callback nor a later approval-ref submission starts execution.
A worker atomically claims the queue, checks versions, revocation, cancellation,
expiry and terms, then performs provider work outside that transaction.

Unknown outcomes stay unknown until lookup/reconciliation. A replacement order
cannot be queued. Only a trusted worker may replay the same key after the
required lookup; inconclusive lookup is never absence. A trusted human recovery
action can schedule reconciliation or a separately authorised forwarding-only
leg. A successful merchant leg must never be purchased again after a forwarding
failure. No code in this prototype holds, routes or settles buyer funds.

**A backend-owned durable task/approval/operation ledger is a hard prerequisite
for phase 4 and every later phase.** A Postgres port must preserve the same
atomic approval/outbox write, uniqueness key (excluding payload hash), conditional
worker claim/fencing, reconciliation mapping and ownership checks. This memory
adapter provides no cross-process durability or crash recovery guarantee.
Migrating persistence and adding production reach require a separate brief.

## Fixture freeze and evaluation

The five files listed by tests/fixtures/shopping/frozen-manifest.json bind the
reviewed v2 journeys, fixed clock, X01–X12 and the six faults. The manifest must
be committed before the first evaluation. No fixture or oracle may be tuned
after results. The phase-2 clarification makes X01 Japanese-only (or empty) with
the original native hold preserved, and makes every recovery path trusted-only.

The model-off and scripted arms use the same fixtures and trusted user actions.
Scripted proposals contain no model calls; rejected trusted calls remain in the
record. Server templates alone render commercial facts from current evidence.
Large logs are retained outside Git; a small results/evidence manifest records
their hashes. Node and all children require the strict network guard; Python
probes require separate denial; macOS gates additionally require sandbox-exec
with network access denied. No dependency download is part of this prototype.
