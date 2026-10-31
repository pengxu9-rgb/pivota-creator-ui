# Admission kernel: round-6 tests and evidence

Implemented locally on `codex/admission-kernel-20261028` from `709ece441ae98e5300fbd801f0354bf8d808af99`. Test commit and measured gate head: `a0ab8c79570f6847ad3f07399d8af095b4462d6f`. The final evidence-only commit SHA is supplied in the handoff; its source, tests and frozen mutation inputs are unchanged. Nothing is approved: Claude Code must re-review the exact final head.

## Changes and tests

Production `src/` is byte-identical to `709ece4` (Git tree `e8bb0ab1855d58ab463ac4ff051b7f93d5e07b3f`). Existing tests and earlier evidence are unchanged. Only `tests/admission-round6.test.cjs` adds five tests.

- Collector, set and confirmation anchor tests cover all 11 supplied examples plus eight added leading-prose examples: 19 texts, including `4/102`, `SV1` and all six confirmation words. Plain/recommendation histories and latest/older replies behind a newer safe ask are crossed with page/refine: 152 direct held-action cells.
- The real conversation/private-workspace boundary repeats all 152 negative cells: `catalog_stored_goal_requires_restart`, zero catalog-client calls and workspace writes, stored bytes unchanged. The transport is an in-memory fixture; this is not a new native-catalog measurement.
- Twelve bare/punctuated positive forms replay in both modes and placements: 48 successful service replays.

## Gates

| Gate | Result | Exit | Network attempts |
| --- | --- | --- | --- |
| Full suite | 403/403; 34 files | 0 | 0 |
| Original suite | 291/291; 21 files | 0 | 0 |
| Fresh mutation sweep | 93 × 34 complete test-file cells; 88 caught, five documented equivalents | 0 | 0 |
| Mutation verification | 3,290 cells/syntax checks; 385 frozen input hashes; 287 explicit assertion failures | 0 | 0 |
| TypeScript after scratch cleanup | passed | 0 | 0 |
| Vocabulary `--check` | identical | 0 | Node/Python 0 |

All three R6 mutants are caught by explicit assertions in the new test file. The [per-mutant/per-file table](mutation-table.md) contains the fresh exit vector for every row; no subsets or retained cells. Contract exceptions, timeouts, signals and syntax failures are not sole kill evidence. [Gate summary](gate-summary.json) binds the actual matrix, verifier and raw logs by hash.

To recheck the recorded matrix, use the external verifier in a review checkout at the measured code commit `a0ab8c79570f6847ad3f07399d8af095b4462d6f`; it deliberately requires that Git HEAD. Review the final handoff SHA through source/test/frozen-input tree and hash equivalence, or run a new fresh sweep with the final HEAD.

Native and clarification replays were not rerun because production source is unchanged, as the brief permits. The evidence retained at `709ece4` remains available; no fresh native or model claim is made. Runtime identity echo, pre-deploy commerce ingress, R3-4 usability and a live Gemini check remain out of scope.

## Preserved attempt and process signals

The first attempt stopped after 53 completed rows because the existing isolated Python filesystem probe lacked a Python socket-deny layer. Its incomplete outputs remain external and are not retained as final cells. One ownership-verified `SIGTERM` was sent to our own test leaf, PID 9526, so the runner could drain; no foreign process was signalled. Scratch was cleaned. A guarded Python launcher was then installed externally.

A separate guarded-baseline attempt passed all 403 tests but failed closed while binding Python metadata: macOS `/var` and `/private/var` paths differed. It has zero completed mutant rows and is not a passing gate. Its scratch was cleaned. The external harness now canonicalizes cwd; the final 93 × 34 sweep runs afresh after both corrections, retaining no old cells. Both attempts remain hashed externally.

The final sweep binds 95 zero-attempt Python worker records to their actual Node parents; the original-291 suite adds one separately namespaced guarded worker. Vocabulary generation retains its own denial hook. Separate controls record two deliberately denied synthetic audit events overall: one current preflight and one preserved pre-atomic preflight (each expected exit 1), both with no OS network I/O. These are not final gate attempts; all 96 final test-worker Python records report zero attempts.

## Small committed evidence

This directory contains **4 files / 1263326 bytes**, below both limits (2 MB; 50 files). Raw evidence, executable harnesses, logs and cell metadata remain outside the repository at:

`<evidence>/admission-kernel-round6-evidence`

The [raw-log manifest](raw-log-manifest.json) inventories all 10669 external files (39047003 bytes). Manifest SHA-256: `6dfc29bfc7ba34d5efa6e8737c0536d07de5bf6c3d7ccdf918f61981bddce3fc`. The plaintext manifest groups shared directory prefixes and verifies exact reconstruction of every inventoried path/hash; it omits no file. The snapshot includes all closed files at finalization; later external additions require a new manifest. Earlier rounds were not moved or deleted. [Evidence options](../EVIDENCE_PLAN.md) presents keep-as-is, external/separate-branch storage and squash options with PR sizes and verification tradeoffs; no option is selected.

All final Node/Python gate execution used denial guards. Load observations are retained in the external matrix. The one owned-process signal is disclosed above; foreign signals are zero. No push, PR action, merge, deployment, pin/IAM/provider/Vertex change, live call, order or payment occurred.
# Public-main preparation note

The historical raw-log manifest payload remains in this directory as `raw-log-manifest.json.gz`, with a hash/size descriptor at `raw-log-manifest.json`. Compression is lossless; no round-6 gate or input was externalized. The current fresh gate includes main's 43 test files (475 tests) and binds main's 51 release-router Python workers per sweep in addition to the context worker. Historical results below describe their original source head.
