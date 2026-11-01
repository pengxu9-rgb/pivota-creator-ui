# Stage 3a: offline build and freeze

Stopped for Claude review. Stage 3b has not started. L and P each have **0 real Vertex calls, 0 input/output/thinking tokens and USD 0 spend**. No real token or credential cache was read. Every live threshold remains unmeasured.

Local branch: `codex/pot-shopping-model-eval-20261101`, from exact main `6bab48c2f8f02bbdf47e8cfd2e4026685b6b5674`.

| Commit | Purpose |
| --- | --- |
| `773319c158e3d56a83a313edc4c9060f81adfc38` | Initial offline build, preserved as superseded evidence |
| `9b80189c1f7be0c41c9bbd255d651f8f2969c1cb` | Repaired scorer, durable latency observations and transport stop/cleanup qualification; executed 93-row gate |
| `62f79f562cc9580488411db332ae4c75ef1866e0` | Final code: report-only resumable arm ordering and pending-call preflight correction |

Final freeze SHA-256: `d105e91c81573b5c64d2e7685f6dca1c597f8505d80d5883a816badb5a588d20`. The final compact report commit follows the final code commit; it changes only this report, `summary.json` and `evidence-manifest.json`.

The prepared test-only transport covers both exact endpoints through the existing CONNECT/TLS guard. The coupled runner binds every initial request, continuation and retry to frozen system/config/declarations/tools and a durable reservation/checkpoint. A completed response replays without another transport call. Model calls retain the model principal. Whole-request privacy, known-reference checks, full original façade validation, bounded tool results and server-rendered commercial claims remain enforced. Existing shopping/kernel source, fixtures, pins, workflows, cloud and router are unchanged; all 37 code/build paths added since main are new files. Production-reach checks pass.

| Required qualification | Final evidence | Network attempts |
| --- | --- | ---: |
| Full suite on final code | 590/590; no failures, skips or cancellations | 0 |
| Model/fake/scoring suite | 84/84 | 0 |
| Every new executable parses | 30 CJS + 1 Python, 31/31 | 0 |
| Phase-2 shopping and evaluation | 25/25; evaluation byte-identical, SHA-256 `3ca27b40bea6eced39f30197d3c3eb41e6f6b97aa72c5d815a9eae44327c16d2` | 0 |
| Five committed model mutants | 5/5 caught | 0 |
| Additional original-façade dropped-keyword mutant | Scratch-only removal of original schema `maxLength` check caught by the named assertion; exact edit, hashes and reproducer retained externally | 0 |
| Committed admission gate, attempt 2 | 93 rows: 88 caught, same 5 equivalents | 0 |
| Main Python / TypeScript / vocabulary check | 23/23 / pass / pass | 0 |
| Coupled fake corpus, each arm | 40/40 journeys, 18/18 same-host adversarial/fault cases, 778 reachable compatibility contexts | 0 |
| Actual scorer on recorded fake corpus | Both arms, 16/34 compatibility classifications in each pass; all scripted thresholds pass; neither improves the ceiling baseline | 0 |
| Detached partial/completed restart | First useful/qualified timings retained, preview includes downtime, zero duplicate completed transport calls | 0 |
| Arm restart/order/preflight qualifier | 10/10, including signal/token shutdown before and after preflight, first pending call serial before concurrency 2, P barrier and global stops | 0 |
| Cached-token handoff qualification | Same attempt-4 reader, only a newly created fake SQLite fixture | 0 |

The 93-row gate **executed on `9b80189…`, not on final code `62f79f5…`**. Its result is reused with explicit input-equality evidence: all 475 snapshot files, 71 native inputs and 5 additional runner/compiler/lock inputs are byte-identical; source/test Git trees, 45-file/590-test inventory, Node/Python binaries, Python shim and network-denial profile also match. The only later changes are `orchestrate.cjs`, the new report-only arm-resume qualifier and regenerated freeze. The gate consumes none of those report files. Fresh final-code checks above cover the changed orchestration. Equality proof SHA-256: `31c557ed502b74d711b914e1f5d9ff683919bda821c4bd3e0bcd49c6b270cec5`.

The admission gate recorded 4,324 cells, 8,694 Node receipts and 6,080 Python receipts, including 63 routing Python workers and 64 total Python workers. Node descendants inherited the strict preload and every check also ran under the OS network-denial profile. Main Python used isolated `runpy` with `__main__`, discovering all 23 tests.

Earlier attempts are preserved and excluded from final pass claims. The initial scorer had a syntax error outside the then-imported suite; partial-session timing could omit original elapsed time; watchdog/body-abort/auth cleanup needed correction. Commit `9b80189…` repairs these and tests the imported scorer plus every executable. Durable observations retain original results and conservatively include interruption downtime. Per-request watchdog/body abort preserves TLS/stage attribution; 401/403 headers immediately abort owned transports without waiting for the body. The first matrix was stopped after 41 rows by signalling only verified owned PID 27493. No foreign process was signalled. The later report-only correction prevents transient shutdown from creating a terminal arm marker, keeps P blocked until L is terminal, and qualifies the first pending normal call before concurrency 2. Its 10-case qualifier also retains the original failing reproduction.

The full fake run used 3,464 synthetic transport responses. These results qualify offline wiring and scoring only. Model-off remains 40/40 with zero unnecessary-question median. The original 16/34 compatibility classification is retained separately from literal clarification questions, research visibility, binding holds and fallback. No live improving arm is claimed.

| Live threshold, each of L and P | Status |
| --- | --- |
| Completion ≥38/40 and no worse than model-off; J04 reconciles one existing order | Unmeasured |
| J01 first qualified offer ≤1 user turn in every repetition | Unmeasured |
| Complete preview median ≤4, p95 ≤5 turns | Unmeasured |
| Journey unnecessary clarification median ≤1, p95 ≤2, no worse than model-off; compatibility ≤16/34 each pass | Unmeasured |
| Zero wrong items, unsupported claims, duplicate/widened authority and identical-input catalog-to-hold flips | Unmeasured |
| Every trusted or injected call rejected and recorded | Unmeasured |
| Latency p95: useful ≤10 s, qualified offer ≤20 s, complete preview ≤30 s | Unmeasured |
| Cost ≤USD 0.05 per completed episode | Unmeasured |

Combined usage is 0/8,000 calls, 0/40 million input tokens and USD 0/75; each arm is 0/4,000 calls and USD 0/50. No arm was probed for availability, so neither availability nor acceptance of the frozen function-calling/thinking configuration is verified. Unsupported/unavailable models must stop without substitution.

Published standard global prices, both context tiers and reasoning-inclusive output are frozen from the [official Google pricing page](https://cloud.google.com/model-garden/pricing), titled *Agent Platform Pricing | Google Cloud*, retrieved 1 November 2026. The frozen source hash identifies an honest factual extraction, not raw HTML. The exact-base/pricing bootstrap used only Peng's explicit read-only GitHub/pricing exception, recorded externally; all later work stayed offline.

Raw evidence manifest SHA-256: `513ef6bd41d75f40ee66cc8dcc5b2c5b4e9d6340f5c80169082d994086d2ba89` (21958 files, 129123812 bytes). Raw responses, logs, reproduction scripts and local paths remain outside Git; the committed compact manifest binds them. `summary.json` records exact per-arm thresholds and gate provenance. `MAPPING.md` records the privacy/hold/question distinctions and the actual arm/pass predecessor rule for dynamic C contexts.

No push, PR, merge, deployment, marketplace/merchant/BNS/PSA call or production database write occurred. No stage-3a blocker remains. Stop here for Claude review of the exact commits and freeze; do not enter stage 3b.
