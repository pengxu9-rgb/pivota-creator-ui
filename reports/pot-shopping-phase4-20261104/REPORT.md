# Phase 4 Part A review fixes

Both independent offline reviewers passed the functional repair at `6903247`.
A follow-up review passed the mutation-tooling update at `36cf755dcbd5ee4f520d70d64de730a33725a14c`. The earlier
Part A report is preserved at `3fd7f28`. The current freeze SHA-256 is
`9a2423f88236a600081b8693c8f8e984b17d9b81b3cfdacbd4e18f4d0fb0d9a2`.

The validator tracks approval phases and requires a current complete preview.
It checks the renderer's synthetic URL format and hashes external fixture bytes
before parsing strict UTF-8. The freeze generator and both launcher entry points
replay the bound scripts through the synthetic model-off baseline before writing
the freeze or handing off credentials.

M2 counts only values supplied through a user turn or an accepted interface
selection. L completion requires observed model participation, and scoring checks
the durable receipts and bound model-off rows. The baseline verifies the order
printing and total. These changes were verified against the historical J01–J04
outputs and requests in 56 byte-for-byte comparisons.

The full suite passed 630/630, the model suite passed
124/124, and the explicit harness tests passed
10/10. All 49 model mutations were caught.
All 12 qualifiers passed, including 778 compatibility contexts
and ten L plus ten model-off stand-in episodes. An earlier compatibility attempt
stopped at the fake-token time limit after a wall-clock gap. A model-mutation
run on the functional repair also exposed a stale literal match in the approval
display mutation. The tooling update retargets that same mutation without
altering its assertion.

The fresh kernel gate ran all 93 rows, caught 88, and retained the five known
equivalents. The run recorded 8,694 Node and
6,080 Python audits with zero network attempts.
The local one-minute load started at 15.34 and ranged
from 5.42 to 46.10 during the gate. The gate ran within
the restricted execution environment with the strict Node and Python guards.

All four frozen model files and the generation configuration match `12dc3a1`.
The held-out binding is null. All evaluation traffic used local fake transport.
Raw evidence stays outside Git and is bound by the archive SHA-256
`eee3a0a5ad5ee2238407ad117009f4feb3088ecfbc2533e21f6403c431674031` and manifest SHA-256
`d55c3659a2b83835323bd3297ee4eb3903bd19177d57706c3b33bbb5ce45f575`.
