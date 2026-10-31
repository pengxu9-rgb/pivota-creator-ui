# Pot admission kernel — local implementation report

Implemented Phase 0.5 in a new local worktree and branch. Nothing was pushed, merged or deployed. This work is **not approved**; Claude Code must review the exact resulting branch head.

- Worktree: `<repository>`
- Branch: `codex/admission-kernel-20261028`
- Exact base: `b43278320f35d9aba92976d61524eefb1da22b07`
- Implementation: `1af5966c286bb7585814b05668bc485c906de70c` — kernel, facade, ingress wiring, tests and offline harnesses.
- Final production source: `07e002e1a68eb54c5d9a8df5a988eea52ae91160` — broader completeness detection and independently found gaps.
- Test contract: `059f3d55a7f12d7025d647ba52b40499ba5a5df8` — explicit identity clarification regression.
- Final tested source/test/harness head: `0c6d883c7760e410767f8186a2fdf88b004d94bd` — corpus evidence head binding.
- The subsequent report/evidence commit changes no application source or tests. Its exact SHA is reported with the final handoff.

## Change and scope

`admission.cjs` is the sole constructor of a deeply frozen plan registered in a private WeakMap. Clones, serialized objects and reflected property copies have no authority. Plans bind authenticated owner, chat, reserved chat version, workspace, workspace version and deadline. Catalog invocation consumes the plan once; saving is available once for the same successful selection invocation.

The model-off router, every model intent and reply reroute, typed actions and server-owned bookmark/card/comparison actions now feed the same constructor. The old routers remain candidate generators; their heuristics cannot authorize a catalog call. Bookmark review, card review and bookmark comparison use typed server actions and spend no model calls or budget.

The kernel independently detects language, money, grade, collector coordinates, release codes and search signals. Known positive syntax compiles admitted constraints. Unsupported or unconsumed signals hold the whole turn. This includes exclusions, quotations, unsupported languages/currencies, Unicode currency symbols, spelled amounts, multiple releases/fractions, compact `PSA10`/`USD100` forms and unclassified single words. Unknown words cannot become a reply or a local status/explanation that silently retains the previous goal. Ambiguous dollar/yen symbols have a specific clarification code and an explicit ISO-currency prompt.

`catalogAdapter.cjs` owns the catalog-client capability and the workspace start/advance calls. The private workspace checks an opaque invocation token before reading state and verifies the native echo **before persistence**. Echo failure never persists the bad result, withdraws saved target authority, records the failed chat turn and retains a clarification latch across reopen. Discovery language, present scope filters, candidate constraint fields, admitted preferences and server-record identities are checked. Native language discovery may be authoritative when the native parser legitimately leaves `scope_filters` empty; missing/malformed discovery is rejected for an admitted language. A clarification with no candidates cannot acquire selection authority.

Commerce holds and current-card membership are checked inside admission, then a brand-only facade performs the existing reservation. Membership uses the current workspace, not historical message-card unions. The localhost/manual commerce route no longer bypasses the admitted chat reservation. Pre-selection research remains allowed for a current admitted candidate.

The existing cancellation, recovery, version reservation, model budget, durable pending markers and native turn limits remain in use. No service, database, partner API, outbox, provider integration or pinned native-runtime change was introduced.

## Validation

All commands use the strict Node network preload. It denies sockets, DNS, HTTP(S), fetch and listening sockets, and audits every test worker on exit, including caught forbidden attempts. The Python replay separately denies sockets and DNS. In-memory injected transports and model proposals are fixtures.

| Check | Result | Exit |
| --- | --- | --- |
| Original 21 test files selected from exact base | 291/291 passed | 0 |
| Full offline suite | 323/323 passed | 0 |
| Kernel cross-product | 162 fixtures × 8 proposals × 2 model states × 3 ingresses = 7,776 cells | 0 |
| Actual-service cross-product for all 14 unique original reproduction texts | 14 × 8 × 2 × 3 = 672 cells | 0 |
| Language metamorphic frames | 40 English and 40 Japanese frames | 0 |
| Architecture boundary and scanner negative controls | Passed | 0 |
| TypeScript, original project configuration | Passed | 0 |
| Mutation gate | 31/31 mutants killed, per-file exit codes retained | 0 |
| Read-only native replay | 15/15 held safely; native/current state and reopen checked | 0 |
| Node/Python network attempts | 0 | 0 |

Logs: [original suite](original-291.tap), [full suite](full-suite.tap), [TypeScript](typescript.txt). The first typecheck overlapped mutation scratch-file creation/deletion and hit file-discovery errors; the final original-configuration check ran after scratch cleanup and passed.

The [validation summary](validation-summary.json) binds commands, exit codes, artifact hashes, the exact tested head and production/test source equivalence.

Existing test titles and assertion counts are retained. Three fixture files changed: recovery replies now echo their actual language; Gemini conversation fixtures use real user requests instead of an opaque `initial` string, seed an accepted English preference when the test expects inheritance, and stop returning an unrelated `006/165` record for a `151/165` request; the model-adversary fixture now includes native language discovery. These changes make the injected native replies internally consistent and do not remove or weaken assertions.

The independent before/after AST inventory found the same titles and assertion counts in each modified existing test file: recovery **59 assertions / 9 literal tests**, Gemini conversation **122 / 14**, and model adversary **20 / 6**. Loop-generated cases and all other original test files remain in the 291-test regression run.

An independent read-only agent review at production head `07e002e` passed the four admission files and 84 additional probe cells across 12 new texts, with zero network attempts. It reported no remaining confirmed blocker within this brief. This is supplementary review evidence, not Claude Code approval or a deployment decision.

## Mutation evidence

The [per-mutant, per-test-file table](mutation-table.md) and [full JSON](mutations.json) contain the exact transform, syntax-check exit, four test-file exits, worker network audits and retained logs. Mutations run on isolated source copies; production has no guard-disable flag. Baseline test files all exit zero before mutation.

Two kills are explicitly clarification-contract checks: deleting the explicit ambiguous-currency rule loses the ISO-currency clarification contract; deleting intent completeness loses the compound identity-clarification contract. Other guards still prevent authority loss in these redundant deletions. A separate saved-currency-inference policy reversal is killed by the currency safety suite. No redundant deletion is falsely described as a demonstrated unsafe-execution kill.

Earlier surviving equivalent deletions are retained honestly in [initial evidence](mutations-initial-1af5966.json) and [intermediate evidence](mutations-interim-07e002e.json). Their exit codes were not rewritten.

## Native evidence

The complete [native replay JSON](native-replay.json) binds the tested source head, source hashes, harness/worker hashes and unchanged-source check. It uses the actual conversation service, catalog facade, strict catalog client and private workspace over the read-only native replay transport.

- Database SHA-256: `a72ba074fdf13f426b5709f67926e631ad32f52e92d08ff3e1ab646ed3b8f204`.
- Catalog revision: `10cec52b1334e9f1abafb2508ead08a0ed063c47288e8af1b87df147984818cf`.
- All 69 native runtime source files verified against the existing roster.
- SQLite uses read-only URI mode and `query_only`; the database is hashed again after replay. The 69 native source hashes are verified before replay.
- A separate [independent post-replay integrity audit](independent-post-replay-integrity.json) verified all 69 native sources and the database hash after the evidence commit, with zero network attempts.
- Required F1, R1 quotation/budget, R2 and N1 cases are included. Additional cases cover unknown-name replies, multiple releases, unsupported languages and the independently confirmed yuan/CHF/rupee/upper-bound/CAD-limit omissions.
- Unsafe turns hold before native dispatch, retain the prior accepted goal/preferences, expose no current target, retain the hold on reopen and reject selection during the hold. The prior accepted seed/catalog states are real native results.
- No live market, BNS, PSA, Gemini/Vertex or cloud request was made.

## Finding-to-test mapping

| Finding | Regression evidence |
| --- | --- |
| F1 | Generated language frames and model-off service matrix; native F1 |
| F2 | `commerce hold is enforced by the admission constructor`; brand-only commerce facade regression |
| R1 | All-intent service matrix including reply reroutes; native R1 quotation and budget cases |
| R2 | Identity completeness/local-control tests; native R2 over a prior Pikachu goal |
| N1 | 40 frames per language across all proposals and ingresses; native exclusion case |
| N2 | Generated money/grade corpus, compact and unsupported unit regressions; additional native money cases |
| N3 | Status/explanation completeness and positive local-control tests, including unknown single words |
| N4 | Every saved-currency ambiguous-symbol matrix plus explicit ISO clarification contract and unsafe-inference mutation |
| N5 | Strict typed preference value/unknown-field tests; typed ask/reply service differential matrix |
| N6 | `reviewBookmark`, `reviewCard`, `compareBookmarks` typed-action regression: zero model calls and no model-budget fields |

Adapter regressions additionally cover cloning/forgery, all six bindings, expiry before dispatch/publication, one-use save, native mismatch never persisting even briefly, reopen, and withdrawal of previously saved target authority.

## Clarification measurement and limits

**124 of 146 texts with one clear meaning clarified: 84.93%.** This literal metric includes clear requests outside the pilot grammar. It is a substantial usability limitation, even though those holds avoid losing constraints.

The [labeled corpus JSON](clarification-rate.json) includes every action, label and denominator. It counts 150 unique texts from 162 fixtures once each, rather than multiplying by matrix repetitions:

| Label | Clarifications / denominator | Rate |
| --- | --- | --- |
| Clear supported task meaning | 2 / 22 | 9.09% |
| Clear unsupported pilot request | 122 / 124 | 98.39% |
| Ambiguous | 4 / 4 | 100% |
| All texts | 128 / 150 | 85.33% |

The two supported-task holds are bare `Lucario` and `Vaporeon` turns; the small positive language/identity grammar requires an explicit search or further clarification. The corpus is intentionally adversarial and is not a deployed-user success estimate. No broad conversational readiness, statistical success threshold or production rollout is claimed.

Not done: live or browser E2E tests, deployment, push/merge, release-pin changes, provider access, Beauty identity/folding or response-streaming changes, partner contracts, PostgreSQL/delegation/execution stages, exclusion support and support for additional languages/currencies. These are outside this brief or prohibited. Existing release/native-runtime/IAM/Vertex/provider settings are unchanged. Claude Code should review the exact final local head and these limitations before any later publication decision.
