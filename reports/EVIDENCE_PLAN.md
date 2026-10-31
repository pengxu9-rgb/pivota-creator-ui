# Evidence options before a PR

Peng chose option 2 on 30 October 2026, and this commit implements it. The projections below preserve the earlier proposal; history is not rewritten.

Measurements use uncompressed Git-blob payload bytes of changed files against `b4327832`, not patch-transfer, pack or filesystem allocation sizes. At `709ece4`, prior evidence is **61,592,858 bytes / 10,262 files** across five folders; other changed files are 563,228 bytes / 28 files. Filesystem allocation explains the larger roughly 80 MB review estimate.

The projections below include the same current round-6 additions: its new test, four compact report files and this plan (six files, 1,273,657 bytes). The raw-classification lists and virtual legacy manifest are retained in the external round-6 evidence and hashed by its committed manifest.

| Option | Logical content left in the PR | What stays verifiable |
| --- | --- | --- |
| Keep as is | 63.43 MB (63,429,743 bytes), 10,296 files | All existing logs, result files and tools remain in the product branch. |
| Externalize prior raw outputs | 4.75 MB (4,754,370 bytes), 137 files | Keep 102 prior source/helper/summary files plus one raw hash manifest; fetch archived inputs/logs for full historical verification. |
| Rebuild product history without prior evidence outputs | 2.27 MB (2,266,527 bytes), 88 files | Keep 54 canonical executable/fixture files at their current paths, plus this compact round-6 handoff; archive the old head and full evidence separately. |

Externalization projects 10,160 archived files (60,695,722 bytes) and a 2,020,349-byte manifest. Keeping hashes alone proves integrity only when the raw bytes remain accessible. Unit-test imports and the vocabulary generator path must stay intact; historical native/rate baselines and the mutation equivalence input may need restoration from the archive before rerunning those CLIs.

Deleting files in a later commit reduces the final PR diff but leaves old blobs reachable in product history. Reducing that history requires a separately approved rebuild/squash, with the old exact head and evidence preserved outside it. Archived logs plus manifests retain historical auditability; no migration, branch rewrite or artifact-store publication is authorized by this plan.
