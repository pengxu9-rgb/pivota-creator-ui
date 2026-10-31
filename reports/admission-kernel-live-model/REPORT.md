# Round 10 — Plan B omission check, attempt 4

Local branch `codex/admission-kernel-20261028`. **Not approved.** Base `fb091022c39804e323d3482252d558cb81dc3891`; fix `01382ad6fd97afa816ed9e08bec9e2a055107ffd`; harness/preservation `cef7d3598dc7fabb82f735677e03f8f7f8ba2046`. The results commit contains this report; its exact SHA is the final HEAD reported to Peng for Claude's re-review.

**Result.** All 778 turn-passes were collected and replayed. S1–S6: S1 pass (0); S2 pass (0); S3 pass (0); S4 pass (0); S5 pass (0); S6 pass (0). Coupling rejects **0**, against the pre-registered target 0. The pre-registered recommendation is **model-off**; the pilot decision remains Peng's. Criteria: complete_S1_S6=true; expressible_at_most16_both=false; admitted_catalog_stable=false; p95_at_most2000=true. No product fix followed the live measurement.

**Source scope and offline proof.** Only the schema, the two omission clauses in the named prompt sentence, and exact-five-key non-span normalisation changed in `modelTurn.cjs`. The span variant, all existing validator checks, projection, admission, holds, lists, buildModelInput and all other source bytes are unchanged. Downstream always sees six keys. Legacy six-key empty arrays remain valid; null/non-array/non-empty arrays and missing spans on span intents remain rejected. Schema 2,395 B; prompt 2,938 B; no new examples. [Exact diff](<evidence>/admission-kernel-live-model-evidence/attempt-4/modelTurn.diff) and [byte-scope proof](<evidence>/admission-kernel-live-model-evidence/attempt-4/scope-proof.json). Only the two named tests and new absent-spans file changed.

The bidirectional closed-schema test covers **1,792 combinations**: 25 schema-valid and 41 validator-valid legacy/wire forms. Eight new tests cover all five intents in fresh/result contexts, byte-identical projection and fail-closed edges. Focused tests 148/148. All **5 validator + 4 schema mutants** were assertion-killed (exit 1 each). Regression: all **698 attempt-2 + 101 attempt-3** recorded outcomes, router projections and plans are byte-identical old/new; respectively 510/73 accepted, 167/19 validator rejects, 18/9 projection rejects and 3/0 unavailable. [Proof and mutant receipts](<evidence>/admission-kernel-live-model-evidence/attempt-4/offline-proof.json).

| Offline gate | Exit / result | Network attempts |
|---|---|---|
| Original / full suite | 0 / 291; 0 / 420 | 23/38 Node + 1/1 Python audits; all 0 |
| Fresh 93×36 mutation gate | 0; 88 caught, same 5 equivalents | 6,993 Node + 95 Python audits; all 0 |
| Independent raw verification / input binding | 0 / 0; 3,478 cells, 385 frozen inputs | 0 |
| TypeScript / vocabulary | 0 / 0; vocabulary `9cc544ce…` unchanged | Node 0 / separate Python 0 |
| Proxy / collector controls | 0; 35 / 22 passed | Strict parent 0; fake proxy 6 local, 0 external |
| Phase B twice | 0 / 0; byte-identical SHA `77ab2c392d1a88132270cf41c76f56fecccbecbda74c3567de582ed820af031b` | 0 / 0 |

Mutation definitions, kill rules and target text are unchanged: no retargets; only external paths and file/test/cell counts were adapted. Equivalents: `remove_reply_binding`, `restore_generic_word_reply`, `adapter_execute_runs_held_plans`, `R4_lucario_prefix`, `R4_forms_case_sensitive_ex_only`. [All 93 rows](<evidence>/admission-kernel-live-model-evidence/attempt-4/gates/fresh93/mutation-table.md). The tested validation tree exactly equals fix tree `c52d2000b4a6e18ace5f8352844d2aab39ee9997`. An initial test fixture and first rehearsal expectation failed and were corrected before the final gates; both original logs remain external. The successful rehearsal used fake credentials/local proxy, survived the launching tool's return in its own session, advanced checkpoint **2→10**, and exited naturally at 0 with a final receipt. Three deliberately denied fake-proxy probes are negative controls, not external egress. [Rehearsal](<evidence>/admission-kernel-live-model-evidence/attempt-4/detached-rehearsal-result.json).

**Freeze/preservation.** A–D `c1c9912e…` and E `dc63d42d…` are unchanged; all 389 input hashes and model-off plans reverified. E still records its original `cf5f7b1` freeze; the new source base is the fix above. Set C replays actual earlier proposals into later contexts, records those contexts and recomputes their model-off comparison. Attempt 3's report, proposals, summary and manifest were losslessly preserved from Git blobs in `attempt-3-interrupted/` before any new root results. Old raw evidence is untouched.

**Collection.** One detached run, no restart; `pivota-prod`, global `gemini-3.5-flash-lite:generateContent` only, fixed CONNECT proxy `127.0.0.1:7897`, verified TLS and unchanged CA. Launch `2026-10-31T00:53:15.085Z`; finish `2026-10-31T01:01:59.772Z`. Cached token had 3,574 seconds at the prelaunch metadata check; the agent never refreshed it. Exact calls **778**, completed **778**, retries **0**, 429 **0**, max concurrency 2; stop reason **none**, schema stop receipt null. Any stop indices are recorded there as launch and completion indices. Input reservation at exit 0; budget 1,000 calls/5M input. Whole-run proxy/TLS/request-stage evidence is in `phase-a/collection-summary.json` and `guard-receipt.json`; phase-A guard **pass**. Final detached exit receipt exists, with no signals. No other live destinations, IAM/API/quota/settings changes, marketplace/BNS/PSA calls, push, merge or deployment; release pins unchanged.

| Measure | Attempt 2 (698; A–D) | Attempt 3 (101; A/pass 1) | Attempt 4 (778; A–E) |
|---|---:|---:|---:|
| Accepted / invalid / unavailable / timeout | 510 / 185 / 3 / 0 | 73 / 28 / 0 / 0 | 722 / 55 / 1 / 0 |
| Coupling rejects | 162 | 19 | 0 |
| Non-span spans present: empty / non-empty / invalid | 295/113/0 | 49/19/0 | 0/0/0 |
| p50 / p95 ms | 1,382 / 1,785 | 1,497 / 1,696 | 1,312 / 1,479 |
| Reported input / output tokens | 723,391 / 44,591 | 204,811 / 7,000 | 1,280,301 / 42,269 |
| Intent / plan agreement | 293/349 / 336/349 | N/A | 332/389 / 377/389 |
| Expressible clarification, pass 1 / 2 | 19/34 / 19/34 | 8/8 observed / unobserved | 17/34 / 16/34 |
| Native changed-admitted actions required | 0 | 0 | 0; completed 0 |

Coverage differs; attempt 3's 8/8 is not a full rate. Model-off is **16/34**. Exact rule counts (including projection), current: `{"nonliteral_span":8,"projection_preferences":22,"projection_refine_language":4,"projection_search":21}`; attempt 2: `{"search_with_language":4,"clarify_with_spans":113,"search_with_compound":45,"nonliteral_span":5,"projection_preferences":15,"projection_search":2,"projection_refine_language":1}`; attempt 3: `{"clarify_with_spans":19,"projection_search":1,"projection_refine_language":1,"projection_preferences":7}`. Actual total input/output tokens: `{"input":null,"output":null}`; older actual totals are unknown (A2 three missing usages, A3 missing final receipt). The current missing usage is the single pre-TLS failure on holdout-e-28/pass 2 (launch call 766, completion 765); its 10,381-token reservation stays in the conservative input upper bound, making accounted input 1,290,682, under 5M. It was not retried. No pricing call was made. Current request attempts by terminal stage: `{"http_status":777,"tunnel_established":1}`; HTTP statuses `{"200":777,"none":1}`; TLS issuer CN counts `{"WE2":777,"none":1}`. Allowed requests / proxy / TLS / denied: 778/778/777/0. Attempt 2 had 695 HTTP 200/verified-TLS WE2 and 3 pre-TLS errors; attempt 3 checkpoint had 101 HTTP 200 + 1 TLS-stage request, issuer WE2 (missing final receipt).

**Clarification wording.** Report both layers: the router's generic task candidate can be converted by admission into a language/compound question. A prior claim that every rejected candidate renders generic task text was too broad. In order [router task fallback, rendered task fallback, model-chosen field, other], attempt 2: [185,1,153,441]; attempt 3: [28,0,37,64]; current: [53,1,194,447]. Current rendered fields: `{"compound":424,"finish":5,"language":200,"task":13}`. These categories are not an A/B judgement of wording quality.

**Expressible changes versus model-off, all changed rows and fallback codes:**

| Pass | Text / turn ID | Off → on | Fallback |
|---|---|---|---|
| 1 | Find English Charizard SV03.5 006/165 / turn-673146bd0b6795d4b091 | catalog:English Find  Charizard SV03.5 006/165 → hold:compound | accepted |

**Per-set matrix** [neither catalog, same admitted, narrower, wider]. All wider counts must be 0; unobserved baseline sets prove nothing.

| Set | Attempt 2 | Attempt 3 | Attempt 4 |
|---|---|---|---|
| A | 268,26,6,0 | 100,0,1,0 | 268,31,1,0 |
| B | 254,55,27,0 | 0,0,0,0 | 254,54,28,0 |
| C | 18,16,2,0 | 0,0,0,0 | 18,16,2,0 |
| D | 26,0,0,0 | 0,0,0,0 | 26,0,0,0 |
| E | not included | 0,0,0,0 | 50,27,3,0 |

**Stability, every plan change between current passes:**

| Turn / text | Pass 1 → pass 2 |
|---|---|
| turn-673146bd0b6795d4b091 / Find English Charizard SV03.5 006/165 | hold:compound → catalog:English Find  Charizard SV03.5 006/165 |
| turn-52c3dfbe26132d793e2f / Vaporeon | hold:compound → hold:task |
| turn-320ecec6bda9ffb3a09a / Find Charizard ｈｏｌｏ cards | hold:compound → catalog:English Find Charizard holo cards |
| turn-25ad4b2b94d530c35562 / Find Charizard ﾎﾛ cards | catalog:English Find Charizard ホロ cards → hold:compound |
| turn-b2d7e6bcd8cfbec9c49e / Find Charizard cards 4/102 | catalog:English Find Charizard cards 4/102 → hold:compound |
| turn-669dc57481dcf9ff3cea / ｈｏｌｏ | hold:compound → catalog:reply |
| turn-3c59b9bfa08202c91dbf / Find Charizard cards | catalog:English Find Charizard cards → hold:compound |
| turn-a3e3d4f6c2ee9f22674d / Find Charizard holo﻿cards | hold:compound → catalog:English Find Charizard holo﻿cards |
| turn-2fed00973c971544ea8f / Find Pikachu 精灵球 cards | hold:compound → catalog:Japanese Find Pikachu 精灵球 cards |
| turn-d5744e24deebe7b65a49 / Find Charizard cards | catalog:English Find Charizard cards → hold:compound |
| turn-b95928bb4441ebe0cbf1 / not ex | hold:compound → hold:finish |
| holdout-e-11 / Find English Pikachu SV03.5 025/165 | hold:compound → catalog:English Find  Pikachu SV03.5 025/165 |

10 changes involve an admitted catalog plan (including search↔hold flips), so the catalog-stability criterion is not met. Full plans are retained in `summary.json`/external `comparison.json`, including every baseline change. Native replay: 0 required: no admitted catalog action differed from model-off; no native worker was started. Held service dispatches/writes: 0/0; total dispatches 128, workspace writes 256. Offline stored-flow counterfactual checks do not establish live stored-flow success.

**Not done / decisions remaining.** No approval, push, merge, deploy or pilot change. No collection coverage remains missing. Claude must re-review the exact final head, rerun gates/coupling proof, check prompt overlap, replay phase B and spot-check proposals. The new [compact evidence pointer](<repository>/reports/admission-kernel-live-model/attempt-4-raw-evidence-manifest.json) binds every raw file and the full mutation table outside the repository; footprint is verified at at most 2 MB new/changed and 30 report files. If a safety failure exists, it is reported as P1 without a further fix.
