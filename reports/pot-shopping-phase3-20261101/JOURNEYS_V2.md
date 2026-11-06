# Phase 4 Part A: scripted journey data

`shopping.journeys.v2` preserves the phase-2 entries and adds `catalog`, `steps`,
`answer_key` and `required_fields`. The training transcription is
`tests/fixtures/shopping-model-eval/journeys-v2.json`; the original phase-2 fixture
and evaluator remain unchanged as historical oracles. The runtime driver has no
journey-ID branches. Its script is trusted test input, never model output.

`steps` is ordered. A `user` string increments the turn and invokes the model
unless `model:false`; clarification responses also increment the turn. A user
step's optional `supplies` map names fields and exact nonempty spans in that
string. A trusted `interface:select` step supplies only explicitly listed fields
that carry a value in the accepted requirements. Purpose is provided through a
user turn or a clarification answer. `changes` permits a budget change. Other
bounded interface actions are search_catalog, compare_offers,
get_product, preview, observe_offer, fault and deny_approval. They call only the
existing synthetic facade/simulator. There is no arbitrary method or code hook.

A search step with `measure:first_offer` records the first-offer boundary; a
complete preview with `measure:complete_preview` records the preview boundary.
The shared tail renders the preview, uses the existing trusted approval button,
drains the synthetic worker and renders its receipt. Optional `after_approval`
steps allow user turns, get_operation and drain for the existing training timeout
journey. Operation reads and drains belong after approval. Baseline-only event annotations preserve
the historical model-off transcript; they are not model prompts.

M1 counts a question as necessary only while its field remains unresolved in the
answer key. Its frozen answer is consumed once. In a held-out clarification,
the driver handles each distinct field in order and sends the answers as one
scripted user turn. Resolved fields and questions outside the key get the frozen
unexpected-question fallback.
M2 counts distinct required fields missing at any selection or preview boundary.
Supply comes only from a declared query/user span, an actual answer to a model
question, or an explicit trusted interface choice. An answer oracle by itself
does not supply a value. A later supply cannot erase an earlier miss. Requirements
may still let the synthetic script complete: M2 exposes that scripted assistance.
Both measures are disclosed without adding a new threshold. Missing episode
observations stay missing, not zero; previous phase-3 thresholds are retained.

The heldout plan has only model-off and L, ten repetitions per journey, no attack,
fault-case or compatibility population, 1,200 calls / 6M input tokens / USD 2 for L
and USD 0 for P. Held-out scripts require a model-enabled user turn before
approval and exclude embedded faults and post-approval user turns. Scoring
counts HTTP 200 receipts separately from validated, non-fallback model turns.
L completion requires both and a completed synthetic script. A script that
completes with only fallback turns is disclosed separately. L question metrics
keep every planned episode in the denominator and treat results without usable
model evidence as missing. Fallback totals and reasons include all recorded
model turns, including episodes that also received a usable plan.
The conservative per-call reservation and previous stop rules still apply.
`scoreHeldout` reports measured-only quantities. Part C owns future scoring rules.

No real held-out set is included, read or authored in Part A. Qualification clones
an existing training journey as `STANDIN` in temporary external storage. A future
blind set and every catalog must resolve outside the repository. Catalog paths
inside that file are relative to its directory, cannot escape with `..`, and are
bound individually by SHA256 of their raw UTF-8 bytes along with the journey file.
Malformed UTF-8 is rejected before parsing. The training catalog path resolves
from the repository root. The validator requires synthetic HTTPS URLs, rejects
non-synthetic records/sources, missing refs, invalid supply spans, invalid required
field subsets and scripts without a measured complete preview that remains
approvable at the end of the pre-approval steps. Offer URLs must use the canonical
synthetic prefix accepted by the renderer. Before a fixture can be frozen or
launched, the validator runs each journey once through the existing synthetic
model-off baseline so admission, preview, and receipt checks also pass.
The unchanged evidence validator assigns missing printing evidence refs.

`prepare-freeze.cjs --heldout <external-file>` is a future freeze operation after
blind authoring, not performed in Part A. The committed `heldout_fixture:null`
deliberately prevents launch. Python and Node launch gates require the separate
`claude_4_heldout_go`, the exact new freeze hash, L, a matching external binding and
the existing cached-token lifetime. They verify the frozen artifacts and replay
the synthetic script before token handoff. The launcher binds the cached-token
helper by its exact bytes. A process holds an exclusive run-directory lock
through checkpoint close, including when Python hands off to a detached worker.
Fake heldout rehearsal uses `qualify-heldout.cjs`, never the live launcher.

Equivalence executes the pinned historical driver from commit `12dc3a1` in
memory and compares serialized outcomes and requests under a fixed clock. The
checked-in snapshot and hash manifest make the comparison independent of Git
history. The only excluded output field is the additive M2 value, which had no
old representation. The model-off adapter is also compared against the pinned
historical evaluator. The model freeze qualifier verifies that the system
instruction, generation configuration, limits, declarations and context match
the historical snapshot. The runtime patch check binds the exact retry accounting
change in turn.cjs alongside the driver and validator. The kernel gate snapshots
these report dependencies for isolated tests.
