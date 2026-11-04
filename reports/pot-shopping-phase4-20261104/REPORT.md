# Phase 4 Part A — offline handoff (4 November 2026)

Implementation: `f13e0e5fa9cf8e0e102c9d2d7d207782726951b1` from `12dc3a19299c19e200541c4261a69658c26a1b72`.
Freeze SHA256: `8a030abaaeda8e9ed2fa8e80fb6ed2476d2cb05a7f6a3748e241c98c035b54c6`.

The episode driver now executes schema-v2 scripts, accepts per-set catalog fixtures,
and records M1 unnecessary clarifications and M2 missed necessary questions.
M2 latches missing user-supplied required fields at selection/preview, without
letting the fixture requirements oracle fill them. New question measures have no
new threshold. The heldout plan is L plus model-off, ten repetitions per journey,
with a separate 1,200-call / 6M-input / USD 2 L, USD 0 P budget.

No real held-out journey was read or authored. The committed heldout binding is
null, so launching is deliberately blocked. The qualifier uses only an existing
training journey cloned into a temporary synthetic stand-in. Future blind input
must be external and frozen by journey/catalog hashes, then separately approved
with `claude_4_heldout_go`. Production shopping remains model-off.

The first kernel attempt stopped after 74 rows on worker deadlines and is retained
unchanged. A later retry was interrupted after 56 rows without a final receipt;
its cause is unknown and its logs are also retained. This result comes from a
fresh full 93-row retry, with no partial cells
reused. For the retry only, idle sleep was prevented with a temporary caffeinate
assertion and raw logs were written to local temporary storage, then archived
outside Git. No source, concurrency, deadline or freeze changed.

## Evidence

- J01–J04: 28 checked-in comparisons plus 28 supplementary comparisons using the
  exact existing corpus, smoke and detached-worker fake response recipes. Every
  legacy outcome, turn count, metric, simulator statistic, durable model-turn
  outcome and serialized request matches byte for byte under a fixed clock.
  The additive M2 output is excluded only from the legacy byte comparison.
  Model-off is compared to the unchanged historical phase-2 evaluator. The old
  runtime branch driver is removed; the comparator loads its original Git blob.
- Full suite: 624/624. Model suite: 118/118. Explicit harness tests: 10/10.
- Model mutation gate: 49/49 killed on the implementation snapshot.
- Syntax: 47/47; Python release checks 23/23; TypeScript and vocabulary checks pass.
- All 12 qualifiers pass: equivalence, frozen model, heldout stand-in, runtime
  patch/invariants, syntax, corpus, smoke, compatibility, mapping, detached
  restart, arm resume and CONNECT/TLS guard. The additional exact-transport
  comparison also passes. The runtime byte check binds all 59 loaded runtime
  files; the freeze binds 124 artifacts.
- Corpus fake replay: model-off 40/40; each model arm 40/40 journeys and 18/18
  same-host attack/fault cases, 352 fake requests total. Smoke: 8/8; compatibility:
  778 contexts; heldout stand-in: L 10/10 plus model-off 10/10, 40 fake requests,
  P calls zero. These are harness evidence, not model quality results.
- Fresh kernel gate: 93 rows, 88 caught, the same five documented equivalents,
  zero unexplained survivors. Inventory: 45 files,
  624 tests; 4324 cells,
  8694 Node audits and 6080 Python audits.
  Run on the local Mac under recorded load. Peng explicitly removed the extra
  80% idle precondition on 4 November; this is not claimed as an idle-machine run.
  Before launch, the 3-second
  CPU sample was 46.3% idle on 10 logical CPUs;
  1-minute load was 4.04. Gate load ranged
  4.57–104.61, including its own workers.
- All network-attempt counts are zero. Every Node process inherits the strict
  preload; Python probes have separate denial; the whole run has an OS network
  block. No foreign process was signalled. Phase-2 evaluation bytes remain
  `3ca27b40bea6eced39f30197d3c3eb41e6f6b97aa72c5d815a9eae44327c16d2`.

## Frozen model boundary and review notes

Files changed within the brief's frozen model side: **none**. turn.cjs (including
the instruction), declarations.cjs, declarations.json and context.cjs are
byte-identical to `12dc3a1`; generation settings are identical. Collector and
scorer changes are evaluation support for budgets, binding and measured-only
question aggregates. The kernel runner only gains the report dependencies in
its snapshot inventory; its 93/88/5 requirements remain fixed.

The standalone validator emits counts only. External file paths, raw prompts,
responses and full worker logs remain outside Git. Compact evidence is bound by
external manifest `a2f48c0ac2e9dca596201638d0a753f79c5595b9d312033fafedeb738dce74d2` (36367 files).
Earlier local attempts and invocation errors are retained there; final gates
above are the successful runs on the stable implementation. An early qualifier
exposed a catalog-binding key collision; it was fixed before the implementation
commit, and disk/in-memory tamper checks now pass.

No release pins changed. No push, PR, merge, deployment, credential read,
marketplace/BNS/PSA/model call, real order or payment. Stop here for Claude's
Part A review, then the separate offline adversarial review before Part B.
