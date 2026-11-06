# PR 36 adversarial review fixes

This report verifies `3909acf240dc1d157b4469a9f8041109cb4c35a1` and freeze SHA-256 `9e70f325a3c98c3c355727dce748e2774e5bc8e038099007b67a6b58c2246d72`. Independent
re-review passed the scoring, portability, retry, replay, and launcher fixes.

- The launcher holds an exclusive run-directory lock through checkpoint close
  and publishes the detached worker PID before sending the framed handoff.
  It checks frozen bytes before credential access, including the cached-token helper.
- Attempts count before dispatch. A timed-out retry still counts, and a settled
  caller timeout replays without another transport attempt.
- The held-out driver answers distinct fields in one scripted turn. The scorer
  separates HTTP receipts, usable plans, and fallback-only checkouts.
- The qualifiers verify the pinned historical inputs without Git ancestry.
  A checkout without .git passed the model contract, episode equivalence, and
  runtime patch checks. The historical comparison uses the historical turn runner.

The full suite passed 636/636, the model suite 130/130, and the
explicit harness 11/11. All 49 model mutations and all
12 qualifiers passed. The 56 historical J01–J04 comparisons
matched outcomes and requests. Compatibility replay covered 778 contexts.
The synthetic stand-in ran ten L and ten model-off episodes.

The fresh kernel gate ran 93 rows, caught 88 and retained 5 known equivalents.
The 8,694 Node and 6,080
Python kernel audits recorded zero network attempts. The local one-minute load
started at 7.52 and ranged from 6.29 to 54.55.
The first run stopped after 21 rows on a worker deadline. Peak one-minute load was 51.69. The retry reran all rows with the original deadlines. Both runs are preserved in the archive.


The system instruction, generation settings, limits, declarations and context
match the historical baseline. The freeze contains a null held-out binding.
Validation used synthetic fixtures and fake transport. The previous validation
report is preserved in `d4f6b5d`. Raw evidence is outside Git and is bound by
archive SHA-256 `3092c6bfe8f78dacd14f77c3526e286d2dc83ca0e83d3cc692277d2a3760d931` and manifest SHA-256 `897f55bdac2dc8093d159773220eca50fbf758b37807f40ecd8f5bd4f9c803ce`.
