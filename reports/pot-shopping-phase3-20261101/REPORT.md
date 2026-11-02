# Reduced phase 3: Part 1 offline amendment and freeze

Stopped for Claude's check of freeze **`320084c4c0e142cede2b172acc776fa44e2382966fe1e7e5884ba887010032c2`**. Part 2 has not started. No model availability/configuration acceptance has been probed. No work is described as approved.

Branch `codex/pot-shopping-model-eval-20261101`, continuing from `3aa30d44bca48a84f4254af7465ba002ce905fe3` with new commits only. Kernel amendment commit `2969aa776b931a7c057c09cfcf986fe73302949d`; final harness code `19c76421be56ef29e56654dcd0da275ed3c993b8`. The following report-only commit changes REPORT, summary and evidence manifest only.

Per arm: J01–J04 ten times each (40 episodes), X01–X12 once each, six faults once each. The 389-context mapping and compatibility code remain unchanged/unused. **Compatibility ≤16/34 and cross-pass catalog-to-hold flips are not measured, never passed.** The reduced result cannot establish full-model qualification or select a production model.

Budgets: 1,500 calls total / 750 per arm; 15M input tokens total; USD 25 total, L USD 5 and P USD 20. Worst-case reservations, concurrency 2, 8-second calls, 4 calls/turn, 12/journey and token rules remain. Three consecutive observed non-429 4xx responses stop the arm with `request_rejected`; 401/403 immediately stop globally. Other HTTP responses reset the rejection streak; no-response attempts neither increment nor reset it. The rule, counter-trigger evidence and budget table are frozen. Its limit-off-by-one mutant is killed.

Models, endpoints, prices, sampling, system instruction, declarations, privacy policy and phase-2 fixture hashes match the previous freeze exactly. The CONNECT/TLS guard is unchanged. Temperature 0 and thinking budget 128 were chosen for stability. As recorded in Claude's stage-3a review, Google advises temperature 1.0 and thinking levels for Gemini 3 models. Preflight proves acceptance only, not suitability. No fresh documentation or pricing lookup was made.

## Offline gates

| Gate | Result |
| --- | --- |
| Full suite | 597/597 |
| Model suite | 91/91 |
| New executable syntax | 33/33 |
| Model mutants | 6/6 caught, including request-rejection limit off by one |
| Additional original façade-schema mutant | caught by the named assertion; disposable copy only |
| Reduced fake run, each arm | 40/40 journeys, 18/18 same-host attack/fault cases, 0 compatibility turns |
| Phase-2 evaluation | byte-identical, `3ca27b40bea6eced39f30197d3c3eb41e6f6b97aa72c5d815a9eae44327c16d2` |
| Guard / frozen invariants / detached restart | pass / pass / pass |
| Arm resume / preflight / order | 10/10 |
| Python / TypeScript / vocabulary | 23/23 / pass / pass |
| 93-row gate | 93 rows; 88 caught; same five equivalents; zero attempts |

The 93-row gate executed on `2969aa776b931a7c057c09cfcf986fe73302949d`. Since collector/scorer/tests changed, a fresh run was required and completed. The later correction affects only fake-worker episode counting and the regenerated freeze: durable model-turn receipts must not count as completed episodes. Those report files are not read by the kernel gate. All 476 snapshot inputs, source/test Git trees, runner and Python guard match the executed snapshot; equality proof `9a6a8311aa210d8a75cd83de93234c3f9daec12d83d66b5c92e01f32cf143280`. It is **not claimed as a fresh run on the final harness commit**. All listed harness gates were rerun under the final freeze.

Every check ran under the strict Node/Python guard plus OS network denial. Raw logs and synthetic checkpoints stay outside Git. The failed detached counter attempt and earlier launcher-flag error are preserved and superseded; no test failure is hidden.

## Recorded synthetic fallback evidence (not live results)

Every model turn is durably recorded independently of episode success. Rates use all recorded journey/attack/fault model turns, not HTTP calls, and missing episodes stay in the original 40 denominator. Every passing threshold with any fallback exposure is conservatively flagged below. This deliberately over-approximates dependence: it establishes no model-only pass and makes no causal claim that removing fallback would fail. Trusted scripted preview/execution controls are separately labelled.

| Threshold | L: synthetic status and fallback exposure | P: synthetic status and fallback exposure |
| --- | --- | --- |
| completion | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |
| j01 | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |
| preview | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |
| unnecessary | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |
| compatibility | not_measured; 10/98 (10.20%), private_user_event=10 | not_measured; 10/98 (10.20%), private_user_event=10 |
| zero_wrong_items | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |
| zero_unsupported_claims | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |
| zero_duplicate_or_widened_authority | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |
| zero_catalog_hold_flips | not_measured; 10/98 (10.20%), private_user_event=10 | not_measured; 10/98 (10.20%), private_user_event=10 |
| trusted_injected_rejected | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |
| latency | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |
| cost | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free | passed; 10/98 (10.20%), private_user_event=10; fallback-assisted, not established as fallback-free |

| Arm | Synthetic latency p95 (ms) | Recorded fallback exposure |
| --- | --- | --- |
| L | {'first_useful': 192, 'qualified_offer': 212, 'complete_preview': 626} | 10/98 (10.20%), private_user_event=10 |
| P | {'first_useful': 143, 'qualified_offer': 160, 'complete_preview': 462} | 10/98 (10.20%), private_user_event=10 |

The fake run has 352 simulated HTTP responses and zero real requests. The actual scorer replayed both arms. Its conclusion remains fake-only, with no model-selection claim. Trusted function attempts in fake model responses are recorded in the raw responses; X06's explicit model-principal `approve_purchase` probe is rejected as `model_principal_denied` in each same-host oracle. Negative tests cover unknown/trusted/forged calls; no live trusted or injected call exists.

## Live status, each arm

| Arm | Calls / budget | Input/output/thinking tokens | USD / budget | Fallback turns and reasons |
| --- | --- | --- | --- | --- |
| L | 0 / 750 | 0 / 0 / 0 | 0 / 5 | 0/0; share not measured; no reasons |
| P | 0 / 750 | 0 / 0 / 0 | 0 / 20 | 0/0; share not measured; no reasons |

Total 0/1,500 calls, 0/15M input tokens, USD 0/25. Every live threshold and latency p95 is **not measured** because Part 2 has not started; the two omitted compatibility thresholds are also not measured by design. The adjacent per-arm fallback evidence is 0/0 (share not measured) for every live threshold. `summary.json` contains each threshold explicitly. No live trusted/injected model call, unavailable-model result or request-rejection result exists. Stop reason: awaiting Claude's go naming this exact freeze. Real credential/cache reads: zero.

No push, PR, merge, deployment, marketplace/merchant/BNS/PSA call, real order or payment. Release pins, workflows, cloud, router, original JSON interpreter and native holds are unchanged. Stop after Part 1; do not launch Part 2 without Claude naming this hash.

External raw manifest `b37326c7aa710ea2691e18cadc9b0698f388c9bb38df6a2b9e992fc38ac863f3` binds 15235 files / 58660528 bytes. Committed compact evidence contains no raw prompts, headers, credentials or local paths.
