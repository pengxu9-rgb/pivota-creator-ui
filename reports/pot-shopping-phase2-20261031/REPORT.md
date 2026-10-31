# Phase-2 harness fix: offline gate report

Stopped at the first failed required gate. No repair, retry or later gate followed that failure. This work remains incomplete and unapproved.

Base main: `8a546642c68e22598c9c03015b9cb04f3c8d85df`. Prior implementation: `922fb3100db72a1115083856082df4a2d048aa47`. Runner-fix commit: `0226c92d7dd6db3962ef6e3a217394f2165cfb12` on `codex/pot-shopping-offline-slice-20261031`. The fix commit changes only `tests/shopping/mutations.cjs`; source, fixtures, manifest and every other test remain byte-identical. This report is the only additional commit.

The audit parser now combines stdout/stderr and strips TAP comments. The valid non-atomic edit publishes the draft inside mutate before validation/beforeCommit, matching exactly once; the unused source comment is untouched. Each mutant has a named target. Mutated modules are loaded and checked for syntax/unbound names before testing. Each kill requires exit 1, target ERR_ASSERTION and no failing test with internal_error, ReferenceError or SyntaxError. Every test run requires at least two zero-attempt receipts.

## Gates, in execution order

| Gate | Result | Exit | Counts | Node / Python audit receipts | Network attempts |
| --- | --- | ---: | --- | ---: | ---: |
| 01-shopping-tests | passed | 0 | 25/25 tests | 2 / 0 | 0 |
| 02-evaluation | passed | 0 | 40/40 per arm; 12/12 adversaries; 6/6 faults | 1 / 0 | 0 |
| 03-mutants | passed | 0 | 15/15 target assertions | 46 / 0 | 0 |
| 04-full-suite | passed | 0 | 506/506 tests | 46 / 64 | 0 |
| 05-original-names | passed | 0 | 292/292 tests | 23 / 1 | 0 |
| 06-main-pot-node | passed | 0 | 481/481 tests | 45 / 64 | 0 |
| 07-main-pot-python | failed | 5 | 0 tests discovered; NO TESTS RAN | 0 / 1 | 0 |

All gates ran inside sandbox-exec `(deny network*)`; every Node child inherited the strict guard. Python workers ran through a separate pre-execution network-denial shim. No dependency installation, credentials, cloud/provider/model calls or process signalling was used. Exit 1 for an expected mutant test is assertion-kill evidence, not a failed gate; a runner failure stops the sequence.

## Evaluation

The unchanged frozen evaluation completed 40/40 episodes in both arms, J01 first qualified offer on turn 1 in all repetitions. Complete-preview median/p95: model-off 3.5/4, scripted 4/4 (limits 4/5). Unnecessary clarification median/p95: 0/0 and 0/1 (limits 1/2). All 12 adversarial cases and six faults passed; 320 scripted trusted/injected calls were rejected and recorded. J04 reconciled one existing merchant order. No safety assertion failed. These are synthetic offline results, not live-source/model qualification.

## Fifteen-row mutation table

Every row below passed its module precheck, exited 1 in the test process and was caught by its named ERR_ASSERTION. No failing test contained a forbidden code error. Full target names are retained for reproducibility.

| Mutant | Target test | Target failure reason |
| --- | --- | --- |
| `non_atomic_approval` | shopping: failed transaction exposes neither approval, reservation nor outbox | Approval, operation and outbox state leaked after the injected transaction failure. |
| `model_complete` | shopping: valid approvals do not confer model execution, payment, case or recovery capabilities | Completion crossed the model boundary: principal_denied was returned instead of model_principal_denied. |
| `payload_hash_in_key` | shopping: two same-key approvals reserve and dispatch once; changed payload conflicts | Changed payload produced version_conflict instead of idempotency_conflict. |
| `unknown_resubmit` | shopping: unknown outcome cannot be replaced or resubmitted by chat, UI or ordinary worker dispatch | Ordinary dispatch changed the unknown operation: later approval returned approval_consumed instead of execution_read_only. |
| `expiry_inclusive` | shopping: admission alone enforces strict expiry and cancellation epoch | The exact-expiry approval did not throw the required rejection. |
| `ignore_cancellation_epoch` | shopping: admission alone enforces strict expiry and cancellation epoch | A stale cancellation epoch did not throw the required rejection. |
| `jpy_times_100` | shopping: money uses integer strings with JPY exponent zero and USD exponent two | JPY 28000 became 2800000 instead of 28000. |
| `persist_assumption` | shopping: both frozen arms complete all eighty episodes, twelve adversaries and six faults | Read-only exploration had accepted JPY/item assumptions where accepted state must be null. |
| `rewritten_native` | shopping: read exploration neither binds assumptions nor rewrites native text | The native probe received the original and corrected query strings instead of no calls. |
| `negated_english` | shopping: negated English cannot be returned even with an explicit English printing ref | The result set included English despite the negative language constraint. |
| `model_recovery` | shopping: inconclusive lookup remains unknown; only trusted recovery schedules another lookup | A model recovery call succeeded where the target required denial. |
| `ignore_owner` | shopping: cross-app refs and cross-user reads reveal no task or evidence | A cross-app preview read succeeded where the target required scope denial. |
| `render_stale` | shopping: renderer rejects missing, injected, superseded and expired evidence | Expired preview evidence did not throw the required rendering rejection. |
| `ignore_source_permission` | shopping: source permission, lot, grade, finish and stale observations qualify independently | An offer with source_permission=false remained in qualified results. |
| `suppress_changed_terms` | shopping: both frozen arms complete all eighty episodes, twelve adversaries and six faults | J04 returned complete instead of terms_changed after the price change. |

## Stop or completion status

First failure: `07-main-pot-python  5 !== 0`.

The Python release-controller gate printed “Ran 0 tests” and “NO TESTS RAN”, then exited 5 under Python 3.14. The validation launcher used the round-6 Python guard’s detached exec globals; unittest.main() discovers sys.modules["__main__"], which still identifies the launcher rather than the executed test module. This is a validation setup defect: no Python release-controller tests were qualified. The separate Python denial receipt records zero attempts. The launcher was not repaired or retried after failure.

- 08-typescript: not run after the first failure.
- 09-vocabulary: not run after the first failure.
- 10-phase-b-1: not run after the first failure.
- 10-phase-b-2: not run after the first failure.
- 11-fresh93: not run after the first failure.
- 12-protected-hash-gate: not run after the first failure.

The original-name check matched all 291 frozen test names in the current 292-test subset; its one additional test is main’s passive browsing-beta seller-access test. Dedicated protected-file gate status is recorded separately; the report’s read-only blob inventory shows all five protected files still hash-match the reviewed head. Both source-tree IDs match and the frozen manifest remains `bd4258fb31b197a64dc8d7b445c4b03dca8b9bce0d9f11aa7cf6fc3bce54ae79`. Pins, workflows, holds, Docker/cloud/router files and backend were not changed.

## Evidence and size

The public summary binds the external raw-manifest SHA-256 `9aa22222bfaebe96e400623113f65a5583dccdc67e6d321a06846acd6f557ac7` (179 files, 1085954 bytes). Raw logs, prechecks, individual assertion failures, Python audit receipts, frozen evaluation output and replay results stay outside Git. The manifest uses bundle-relative paths. No raw local paths or account addresses are included here.

Before these two compact report files: 43 files / 161435 bytes added by the offline slice; excluding frozen fixture/manifest files: 37 files / 137071 bytes. The summary lists every code/test file and size. No push or PR. Stop for Claude review of the exact local commits.
