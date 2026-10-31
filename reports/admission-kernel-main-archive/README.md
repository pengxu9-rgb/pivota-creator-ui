# Additional historical evidence archive

The manifest records the 38 public-scrubbed historical files externalized while preparing source head `918bd46` as one commit on main `3ec4bf7`. Their source originals remain on the two unchanged local admission refs. Neither old ref may be pushed. No source, tests, vocabulary inputs, current attempt-4 data or round-6 gate file was externalized.

The external folder is `<evidence>/admission-kernel-main-evidence-20261031`. The committed manifest binds every repository-relative path, byte count and SHA-256. All copies were verified against all source bytes before deletion. Historical attempts 1–3 were moved first; then only root historical round-2–5 reports that tests and gates do not read, until the size/file limits plus a small report allowance were met.

From a fresh clone, set `ARCHIVE` to that external folder and `TARGET` to the clone's root:

```sh
NODE_OPTIONS="--require=$PWD/tests/helpers/strict-network-guard.cjs" \
  node reports/admission-kernel-main-archive/restore.cjs "$ARCHIVE" "$TARGET" --into-worktree
```

The restore refuses unsafe paths, symlinks, archive/target overlap, and existing mismatched bytes. It verifies every source and restored file. The external folder is read-only input. This restores historical evidence only; it does not authorise executing any historical live or process-control script.

The two earlier large manifest payloads remain inside the repository as lossless gzip beside small pointers at their original names: `reports/evidence-archive/manifest.json` and `reports/admission-kernel-round6/raw-log-manifest.json`. Their pointers bind compressed and decoded hashes and sizes. The old archive restorer verifies and decodes its pointer; its decoded manifest remains `19f12b7e…`. No round-6 gate source, input or historical manifest payload was moved outside the repository.

Offline native helpers now require `ADMISSION_NATIVE_ROOT`, a local folder containing the pinned `batch-v1/catalog.sqlite3`, `runtime-candidate/`, and `build-context-v2/payload/runtime-roster.json`. Hash verification is unchanged. The token launcher requires `POT_VERTEX_ACCOUNT` before reading its local cache; supplying that setting does not authorise a live run. The chat pilot stays model-off.
