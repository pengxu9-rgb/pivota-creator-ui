# Offline shopping build: completed validation

This report supersedes the earlier stopped-run report; its raw evidence and commits remain preserved. No P1/P2 findings remain in Claude's independent review (31 October 2026, review SHA-256 `c31552a71023b3ae077d0c9aa5f0f39a67c135cb5afd3cb4db9327c86665a214`). Review is not merge, deployment or live-phase approval.

Base main: `8a546642c68e22598c9c03015b9cb04f3c8d85df`. Validated gate fix: `e791602744ef36fe6a8205ba623b8a78b9b80af3`. The count fix changes only the round-6 test tool. All shopping source, fixtures and tests match the independently reviewed build; all five protected kernel files match main. Pins, workflows, cloud, Docker and routing policy are unchanged.

## Tooling findings

P3-1 is fixed. The gate discovers the current root test files, runs each pristine file, derives its test/guarded-worker inventory and cross-checks a complete-suite run. Routing worker counts are discovered only in the pristine routing baseline, then checked exactly for all subsequent executions. Cell/audit totals are derived from that inventory and the fixed matrix. No mutation definition, target, kill rule, source hash binding or 93/88/five-equivalent assertion changed. Missing/skipped/cancelled baseline tests, missing audits, unclaimed Python audits and any network attempt still fail.

P3-2 is an offline-host boundary: issuePrincipal is accessible only to the test host. The backend port must never expose principal issuance to a model transport. A backend-owned durable task/approval/operation ledger remains a hard prerequisite for phase 4 and later.

## Validation

| Gate | Result | Exit | Network attempts |
| --- | --- | ---: | ---: |
| Full suite | 506/506 | 0 | 0 |
| Fresh admission mutation sweep | 93 rows; 88 caught; same five equivalents | 0 | 0 |
| Main Pot Python | 23/23, correct module discovery | 0 | 0 |
| TypeScript | pass | 0 | 0 |
| Vocabulary --check | pass | 0 | 0 |
| Phase B, twice | both byte-identical to 77ab2c392d1a88132270cf41c76f56fecccbecbda74c3567de582ed820af031b | 0, 0 | 0 |
| Protected kernel and fixture hashes | unchanged | 0 | 0 |

The updated matrix has **44 test files**, **506 baseline tests**, **63 routing Python workers**, **4230 cells**, **8505 Node receipts** and **6080 Python receipts**. Every worker is guarded, all expected Python receipts are claimed, and no foreign process was signalled. Node and Python guards ran under sandbox-exec network denial.

Claude independently reproduced the unchanged shopping tests (25/25), all 15 named-target mutants, and the frozen evaluation: 40/40 episodes per arm, 12/12 adversaries, six/six faults and 320 trusted/injected call rejections. Its evaluation is byte-identical to the previous local run. J01 offers arrive on turn 1 in every repetition. Preview median/p95 is 3.5/4 model-off and 4/4 scripted; unnecessary-question median/p95 is 0/0 and 0/1. The public summary retains the complete 15-row target/reason table and the fresh 93-row outcomes.

## Release boundary and evidence

The prototype has no production route or UI import. All listings, prices, quotes, certificates, merchants, forwarders and receipts are synthetic; URLs use example.invalid. The model arm is scripted and has no live transport. No live calls, real orders, payments, deployment, source/permission changes or release repins occurred.

The external raw-evidence bundle is bound by manifest SHA-256 `81b513e54b5921215a4ac63d6edc893e84dc9812c9ba6a77ce28e4b736780860` (14566 files, 57507232 bytes). Large logs and local paths stay outside Git. The prior stopped reports remain in commit history. Docker/source-pair checks run in PR CI; they were not rerun locally for this offline tooling fix.

Open the build PR for review; merge only after GitHub CI is green and Peng separately authorises merging. Every later live phase requires separate authorisation.
