# Admission kernel: one-commit preparation on main

**Not approved.** Branch `codex/admission-kernel-main-20261031`, based on fetched GitHub main `3ec4bf7ca745e1a07fafe150e6c4535c54c4ce92` (the expected tip; it had not moved). Source head `918bd468af52b8f87248406305b893a0410105ed`. The single product commit containing this report supersedes the contributions in PRs #26 and #27; no PR was changed. The pilot decision is **model off for chat turns**. The exact product SHA is reported in the chat for Claude's re-review. No push, PR, merge to main or deployment was performed.

## Main integration

There were five textual conflict hunks in two files. The two other overlapping files merged automatically.

| File / hunk | Resolution |
|---|---|
| src/lib/pokemon/conversations.cjs / C1 | Use kernel imports (router, reply renderer, budgets, admit and adapter). Main conversationText is retained as a standalone helper but is not the service authority. |
| src/lib/pokemon/conversations.cjs / C2 | Keep kernel combined cancellation signals, bounded deadline, active checks and pending ownership; omit the notice state used only by new raw correction dispatch. |
| src/lib/pokemon/conversations.cjs / C3 | Keep source user text and durable turn reservation, route every candidate through admit and every execute/save through catalogAdapter. Do not retain main raw workspace start/advance/save or rewritten-text dispatch. |
| src/lib/pokemon/conversations.cjs / C4 | Combine main historical pendingTextNotice disclosure/clear with kernel modelPending clear, commerceAnchor withdrawal and reconfirmation. Get/reopen never reruns native work. |
| src/components/creator/pokemon/shopper/useMobileAgent.ts / U1 | Keep shared latestCatalogMessage admission-aware filtering and main restoringConversation computation/return. All main native-history, reset and cancellation changes remain. |
| src/components/creator/pokemon/shopper/MobileAgent.tsx / no conflict | Automatic merge: retain main restore/loading UI, qualified starter prompt and seller-access journey; retain kernel action eligibility. |
| tests/pokemon-private-context.test.cjs / no conflict | Automatic merge: retain main neutral private-coverage fixtures/assertions and kernel packaged helper checks. Explicitly inherit NODE_OPTIONS into the Python fixture child. |

Main's original-message persistence, URL updates without server navigation, bootstrap cleanup, true-navigation/unmount cancellation, new-chat readiness, restore loading UI and private neutral coverage are retained. The real-hook URL/reset regressions pass.

**Main shortcuts dropped under the brief's admission exception:**

- Automatically correct pikacu to Pikachu and send corrected text to native. That path rewrites user identity and directly dispatches without an AdmittedPlan. The kernel requires an admitted literal query; a held typo can be followed by Find Japanese Pikachu cards in the same chat.
- Treat a New question prefix as an unconditional native restart, or reuse a legacy workspace whose stored goal is not admitted. This bypasses whole-text/stored-goal admission. Keep the kernel hold/new-chat recovery boundary; do not relax bare-name, compound, preference or ISO-plus-symbol holds.
- Persist a new correction notice on raw corrected dispatch success/failure. No corrected raw dispatch occurs. Original user messages, admitted-turn failure/cancel persistence and old pending-notice recovery remain.

No bare-name, compound-search, preference or ISO-plus-symbol hold was relaxed. Admitted literal follow-ups still recover a held typo in the same chat. Stored unsafe legacy goals retain the kernel's restart boundary. Old pending correction notices are disclosed once without native replay; new typo-correction dispatch notices are not manufactured.

All 15 main-side files were checked, including non-conflicting changes affecting composition, routing and recovery:

| File | Preserved behaviour |
|---|---|
| src/components/creator/pokemon/live/CommerceChat.tsx | Keep explicit listing-button selection and classic quote/refusal presentation; no numeric source-order selection bypass. (Byte-identical to main.) |
| src/components/creator/pokemon/live/CommercePanel.tsx | Keep classic source availability, refusal and quote review controls. (Byte-identical to main.) |
| src/components/creator/pokemon/live/useCommerceFlow.ts | Keep selected-offer compatibility, refusal handling, destination/expiry/handoff checks. (Byte-identical to main.) |
| src/components/creator/pokemon/shopper/MobileAgent.module.css | Keep main seller-access and journey presentation styles. (Byte-identical to main.) |
| src/components/creator/pokemon/shopper/MobileAgent.tsx | Keep restore skeleton instead of welcome during navigation; keep qualified Pikachu starter and passive beta seller-access journey. |
| src/components/creator/pokemon/shopper/OfferEvidenceBoard.tsx | Keep offer eligibility/selection and evidence rendering strengthened by main. (Byte-identical to main.) |
| src/components/creator/pokemon/shopper/OfferJourney.module.css | Retain new passive seller-access journey styles. (Byte-identical to main.) |
| src/components/creator/pokemon/shopper/OfferJourney.tsx | Retain new passive source/offer/quote status journey, with provider activation absent. (Byte-identical to main.) |
| src/components/creator/pokemon/shopper/useMobileAgent.ts | Keep native-history URL updates (no server navigation), local bootstrap cleanup, back/forward/unmount cancellation, new-chat readiness and restoringConversation; combine admission-aware latest message helper. |
| src/lib/pokemon/commerceContract.cjs | Keep stricter selected-offer/quote evidence validation and detailed refusal support. (Byte-identical to main.) |
| src/lib/pokemon/commerceTypes.ts | Keep main source/quote contract types. (Byte-identical to main.) |
| src/lib/pokemon/conversationText.cjs | Keep standalone helper/unit coverage. Its corrected-raw/native dispatch and broad restart shortcuts are not integrated into the service; admission governs. (Byte-identical to main.) |
| src/lib/pokemon/conversations.cjs | Resolve the four conflict hunks as above; keep original message persistence and disclose only historical pending correction notices. |
| src/lib/pokemon/privateCoverage.cjs | Keep main private neutral report/hash-bound read gate, without source activation. (Byte-identical to main.) |
| src/lib/pokemon/sourceReadiness.cjs | Keep main passive provider availability reporting without activation. (Byte-identical to main.) |

## Public-tree scrub

The scan covers the whole tracked tree, including decoded gzip payloads. Its indicators are reviewed as data; an HTTP header-scheme literal is not a credential.

| Indicator | Before | After |
|---|---:|---:|
| Email patterns, all values | 13 | 11 |
| New email literal values not on main | 2 | 0 |
| Local home/temp path patterns | 151 | 0 |
| OAuth access-token prefix | 0 | 0 |
| HTTP bearer-scheme indicator | 17 | 17 |
| PEM begin marker | 0 | 0 |
| Base64 runs of at least 100 characters | 0 | 0 |
| New recognised project/bucket values | 0/0 | 0/0 |

Per-pattern before/after file lists are in [summary.json](summary.json); literal private values are not copied into it. The account launcher now requires `POT_VERTEX_ACCOUNT` before cache access. Its four-case fake-cache probe passed with zero real cache reads, refreshes or network attempts. Remaining email values already existed on main. No access token or token hash was introduced.

Offline native helpers require `ADMISSION_NATIVE_ROOT`; paths in provenance/docs use repository/evidence-relative labels. Vocabulary generation metadata changed its output hash from `9cc544ce21232f9c729f22adbcb6d680bd12059338ea7df4a02020bad80410ec` to `6d763083ca01413f7d071d2e65a34145da49543338df6b2c12f1d682ac20a516`, and its generator hash/output binding were regenerated. All vocabulary semantics are byte-identical after removing generation metadata. The pinned database hash and all 69 runtime source hashes are unchanged. The pool fixture was freshly regenerated offline; only its worker binding changed `9302a92920e071c45b5fa9c89905c932da8be67ed03cc007e9d28bc791a59579` → `b48dfca8dba37c0670e58c8b9998a8c5fa5d14a9af0efed950ee6378892efc50`; its proof payload is otherwise identical. No asserted check was disabled. Historical report/link text changed where scrubbed; archive/pointer hashes bind the scrubbed versions. Old external evidence and both old refs were not edited.

## Size and restore

Diff against main: **145 files / 4,984,588 bytes new or changed**, under 150 files / decimal 5 MB. Only the final tree enters the one new commit; the private 61 MB history is not an ancestor of it.

Moved **38 files / 818,092 bytes**: all 11 files in preserved attempts 1–3 first, then 27 root historical round-2–5 reports unused by tests/gates, until both caps plus a report allowance were met. [The manifest](../admission-kernel-main-archive/manifest.json) lists every path, byte count and SHA-256; SHA `34de877f7e759964174351a1561648e4b9b048831cef9f4d6729964cbefd98b6`. The new external folder is `<evidence>/admission-kernel-main-evidence-20261031`. Every external and source byte was verified before any deletion. A fresh clone plus that folder restored all 38 files byte for byte (exit 0, network 0).

No source, tests, vocabulary builder/input, round-6 gate, current corpus/E/proposals/summary/replay/report was externalized. Two historical manifest payloads remain **inside** the repository as lossless gzip with descriptors at the original names. The legacy archive restorer verified both hashes and restored all 10,171 files / 60,773,067 bytes, exit 0/network 0; its decoded manifest remains `19f12b7e…`. The round-6 descriptor binds its scrubbed decoded payload and compressed bytes. Restore instructions and safe-path checks are in [the archive README](../admission-kernel-main-archive/README.md).

## Offline gates

The isolated validation snapshot `ff6b78af8ffbaa1222ce371e67c7cf2983f6f816` has the exact staged pre-report tree `4290515dcd970a8de048b45d9321dd78db50121c`. Final source/test/executed-gate inputs remain identical. Afterwards, these two result files are added and one redundant final newline in the non-executed historical round-6 Markdown report is removed; the exact before/after hashes are recorded in summary.json. Every Node worker inherited the strict preload; Python network was denied separately. Mutation-worker receipts are additionally bound to parent/program. Proxy variables were unset. No live/cloud calls were made; the only authorised network operation was the read-only GitHub main fetch (retried after an HTTP/2 connection failure).

| Gate | Exit | Tests | Node/Python audits; network |
|---|---:|---:|---|
| phase-b1 | 0 | — | 1/0; 0 attempts |
| phase-b2 | 0 | — | 1/0; 0 attempts |
| restore-new-archive | 0 | — | 1/0; 0 attempts |
| restore-legacy-archive | 0 | — | 1/0; 0 attempts |
| default-off | 0 | 3 | 2/0; 0 attempts |
| deploy-routing-cli | 0 | — | 0/1; 0 attempts |
| main-pot-release-python | 0 | 23 | 0/1; 0 attempts |
| vocabulary-check | 0 | — | 0/1; 0 attempts |
| typescript | 0 | — | 1/0; 0 attempts |
| original-file-set292 | 0 | 292 | 23/1; 0 attempts |
| main-pot-node | 0 | 162 | 23/52; 0 attempts |
| full475 | 0 | 475 | 45/52; 0 attempts |
| fresh93 | 0 | — | 1/0; 0 attempts |

Full suite: **475/475**, including main's additions. Main's own Node inventory: **162/162**; the full suite also uses the workflow preload/glob. Python private-release synthetic tests: **23/23**. The original 21-file set now has **292/292**; a multiset comparison confirms all **291 original test names** and one added main test. An additional frozen-source fixture probe was 285/291: six old fixtures lack main's new OfferJourney stub, neutral coverage inputs or stricter offer evidence. That probe and all failures remain external; current main fixtures/assertions were retained, with no production relaxation.

The fresh **93×43** mutation gate caught **88**, with the same five equivalents: `remove_reply_binding`, `restore_generic_word_reply`, `adapter_execute_runs_held_plans`, `R4_lucario_prefix`, `R4_forms_case_sensitive_ex_only`. No mutant target/definition or kill rule changed. The runner adds main's snapshot inputs, current file/test/cell counts and guarded/bound release-router Python children; receipt association includes PID plus context/script path. A first partial matrix stopped after 66 rows because the cancellation positive control waited indefinitely when a stricter mutant held before native entry. Only that owned worker was terminated (no foreign signal); the test now races entry against settled/rejected turns. The corrected mutant is assertion-killed without cancellation or signals. This successful matrix reruns all 93 rows from scratch; no cells were reused, and production code was unchanged by that fix. Independent verification checked all **4,136 cells**, **8,316 Node audits**, **4,940 Python audits**, every log/cell hash, source transform and unique Python binding; network attempts 0 and signals 0. The full table is `<evidence>/admission-kernel-squash-prep-20261031/run-2/gates/fresh93/mutation-table.md`.

Phase B ran twice on the combined tree: both exit 0 and byte-identical to each other **and** reviewed summary `77ab2c392d1a88132270cf41c76f56fecccbecbda74c3567de582ed820af031b`. No changed rows on any set; S1–S6 pass with zero failures. No changed admitted action required native replay. The default-off test proves unset/false model flags cause no credential or network work. The runtime default and workflow/Docker/cloud model settings were not changed.

## Deploy routing and limits

**A push of this commit to main would deploy public `creator-ui`.** The reviewed routing implementation classifies unknown `reports/` paths as creator/shared. 145 paths are in the evaluated diff, 100 creator/shared; examples: `reports/EVIDENCE_PLAN.md`, `reports/admission-kernel-live-model/REPORT.md`, `reports/admission-kernel-live-model/attempt-2-raw-evidence-manifest.json`, `reports/admission-kernel-live-model/attempt-4-raw-evidence-manifest.json`. The actual CLI passed on the pre-report validation commit; the final staged path set is classified again with the same implementation. Routing/workflow policy is unchanged. No cloud authentication or deploy command was run.

**Not run:** the exact backend source-pair/context checks because CI pin `2720dde7a6c9852e00f0098bd41ae93171280415` is absent from 13 relevant local checkouts and no backend fetch was authorised; Docker image build/packaged runtime smoke because Docker is unavailable. Existing local dependencies were reused instead of network installation. Local checks used Node 24.10.0 and Python 3.14.7; the workflow requests Node 22/Python 3.11, so this is not an identical CI environment. These parts of the workflow remain unverified; this is not a claim of complete CI reproduction. No pin, API, IAM, quota or provider setting changed.

The old `codex/admission-kernel-20261028` and `…-full-evidence` refs remain at `918bd46` and `e9eba70`, unchanged, and must never be pushed. Claude must re-review the exact single product commit, repeat scans/restore/gates and check the unavailable CI stages. No push or PR is authorised until that review and a new user instruction. Nothing is approved.

External evidence: `<evidence>/admission-kernel-squash-prep-20261031/raw-evidence-manifest.json`; SHA `c8b9c4ef951ec2f1f82499b7ae38834f30de767229b92903c006d890f2f569b5`. [summary.json](summary.json) records the compact evidence binding, conflicts, scan file lists and gate receipts. Restored working copies and dependency links are bound by their input/restore receipts rather than duplicated in that raw-log manifest.
