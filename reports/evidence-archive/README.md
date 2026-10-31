# Local evidence archive

Option 2 was selected on 30 October 2026. The archive is the local folder `<evidence>/admission-kernel-evidence-archive-r1-r5/`. Nothing was uploaded. Its source is **`e9eba70f423fd6e7f37528c8e8f28fa072dab9eb`**, preserved by the local ref **`codex/admission-kernel-20261028-full-evidence`**. Never move, delete or push that ref.

Manifest SHA-256: **`19f12b7eb108293a958166acd71492acb9ce78362757104069185364a543b8e7`**. The archive has **10,171 files / 60,773,067 bytes**. The compact plaintext manifest has one row per moved file: directory prefixes are repository-relative; each full path is `directory + "/" + basename`. Rows retain the byte size, Git blob ID and SHA-256. Archive files were read from those Git blobs and verified before the deletion commit.

For the public-main preparation, the exact manifest bytes are stored losslessly in `manifest.json.gz`; `manifest.json` is now a small descriptor binding compressed and decoded hashes and sizes. The restorer verifies both layers before interpreting the original manifest. The decoded manifest hash above and every archived file binding are unchanged. The archive folder and the full-evidence ref remain untouched.

From the repository root, with `ARCHIVE` set to the folder above and `TARGET` to a separate directory:

```sh
NODE_OPTIONS="--require=$PWD/tests/helpers/strict-network-guard.cjs" \
  node reports/evidence-archive/restore.cjs "$ARCHIVE" "$TARGET"
```

To restore into a disposable product clone, set `TARGET` to that clone's root and add `--into-worktree`. Without that flag the tool refuses a target inside its product worktree, including path aliases. It verifies each source and destination against both hashes, rejects unsafe paths/symlinks and existing mismatched files, and fails on the first mismatch. The archive is read-only input. Current gates require no restored archive; the 93-row fresh gate accepts a new external output directory and an exact head:

```sh
NODE_OPTIONS="--require=$PWD/tests/helpers/strict-network-guard.cjs" \
  node reports/admission-kernel-round6/mutations.cjs "$OUTPUT" "$HEAD"
```

Restore first for historical round-2/3/4 native replays and clarification-rate comparisons, earlier mutation/result verification, and superseded round-5 native/controller or delta runs. Their original inputs and archived orchestration tools return at their original paths. Restoring process-signalling scripts does not authorize running them. Because restored bytes are identical, historical native replays need not be rerun for this move.

After restore, `reports/` matches the source tree except for `reports/EVIDENCE_PLAN.md`, the three files in `reports/evidence-archive/`, and `reports/admission-kernel-round6/{mutations.cjs,python-guard.py}`. Source and tests are unchanged.

**Old blobs stay reachable in this branch's history.** Main gets only the final tree if Peng squash-merges the PR. Removing old blobs from branch history requires a separately approved rewrite (option 3). This change approves no push, merge, deployment, remote upload or live check.
