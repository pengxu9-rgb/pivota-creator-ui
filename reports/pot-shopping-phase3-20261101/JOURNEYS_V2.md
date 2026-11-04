# Phase 4 Part A: scripted journey data

`shopping.journeys.v2` preserves the phase-2 entries and adds `catalog`, `steps`,
`answer_key` and `required_fields`. The training transcription is
`tests/fixtures/shopping-model-eval/journeys-v2.json`; the original phase-2 fixture
and evaluator remain unchanged as historical oracles. The runtime driver has no
journey-ID branches. Its script is trusted test input, never model output.

`steps` is ordered. A `user` string increments the turn and invokes the model
unless `model:false`; clarification responses also increment the turn. A user
step's optional `supplies` map names fields and exact nonempty spans in that
string. A trusted `interface:select` step supplies only its explicit `supplies`
list, not every value in the requirements oracle. `changes` permits a budget
change. Other bounded interface actions are search_catalog, compare_offers,
get_product, preview, observe_offer, fault and deny_approval. They call only the
existing synthetic facade/simulator. There is no arbitrary method or code hook.

A search step with `measure:first_offer` records the first-offer boundary; a
complete preview with `measure:complete_preview` records the preview boundary.
The shared tail renders the preview, uses the existing trusted approval button,
drains the synthetic worker and renders its receipt. Optional `after_approval`
steps allow user turns, get_operation and drain for the existing timeout journey.
They cannot approve or submit anything. Baseline-only event annotations preserve
the historical model-off transcript; they are not model prompts.

M1 counts a question as necessary only while its field remains unresolved in the
answer key. Its frozen answer is consumed once. A supplied field is resolved;
other or repeated questions get the unchanged unexpected-question fallback.
M2 counts distinct required fields missing at any selection or preview boundary.
Supply comes only from a declared query/user span, an actual answer to a model
question, or an explicit trusted interface choice. An answer oracle by itself
does not supply a value. A later supply cannot erase an earlier miss. Requirements
may still let the synthetic script complete: M2 exposes that scripted assistance.
Both measures are disclosed without adding a new threshold. Missing episode
observations stay missing, not zero; previous phase-3 thresholds are retained.

The heldout plan has only model-off and L, ten repetitions per journey, no attack,
fault-case or compatibility population, 1,200 calls / 6M input tokens / USD 2 for L
and USD 0 for P. The conservative per-call reservation and every previous stop
rule remain. `scoreHeldout` reports measured-only quantities; Part C owns future
scoring rules. No result enables the production model.

No real held-out set is included, read or authored in Part A. Qualification clones
an existing training journey as `STANDIN` in temporary external storage. A future
blind set and every catalog must resolve outside the repository. Catalog paths
inside that file are relative to its directory, cannot escape with `..`, and are
bound individually by SHA256 along with the journey file. The training catalog
path instead resolves from the repository root. The validator rejects live URLs,
non-synthetic records/sources, missing refs, invalid supply spans, invalid required
field subsets and scripts without selection and a measured complete preview.
The unchanged evidence validator assigns missing printing evidence refs.

`prepare-freeze.cjs --heldout <external-file>` is a future freeze operation after
blind authoring, not performed in Part A. The committed `heldout_fixture:null`
deliberately prevents launch. Python and Node launch gates require the separate
`claude_4_heldout_go`, the exact new freeze hash, L, a matching external binding and
the existing cached-token lifetime. They validate input before token handoff.
Fake heldout rehearsal uses `qualify-heldout.cjs`, never the live launcher.

Equivalence executes the old driver from Git commit `12dc3a1` in memory and
compares serialized outcomes and requests under a fixed clock. The only excluded
output field is the additive M2 value, which had no old representation. The
model-off adapter is also compared against the unchanged historical evaluator.
`qualify-model-freeze.cjs` separately proves byte equality of turn.cjs,
declarations.cjs, declarations.json and context.cjs, plus identical generation
configuration, against that commit. The runtime patch check is extended to bind
the new data driver/validator; the kernel gate snapshots these report dependencies
so its current full test inventory can execute in isolated copies.
