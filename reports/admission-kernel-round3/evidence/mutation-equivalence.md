# Round-3 historical mutation equivalence rationale

The historical mutation gate preserves all 49 IDs. A killed row remains killed
and retains its actual per-file exits. Only a row whose complete assigned test
vector passes can use a reason below. No test or fixture is weakened in a mutant
copy, and an unexplained survivor fails the gate.

## Preliminary reply predicates subsumed by final admission

`remove_reply_binding` removes the identity term in the preliminary
`isNarrowReply` predicate. `restore_generic_word_reply` expands that preliminary
predicate to allow arbitrary single words. The round-3
`whole_text_positive_grammar` rule subsequently checks every actual reply:

- its forwarded text must equal the raw admitted text;
- it must be bound to the current native finish/release, printed-set, or coordinate
  prompt; or be an exact confirmation at a select/confirm prompt.

These conditions do not consult `isNarrowReply` or the widened `NARROW_REPLY`
expression. Therefore neither historical deletion can authorize an unbound or
nonliteral native reply. An action transformed into an ask also receives the
whole-text positive grammar before dispatch.

These are **safety/conformance equivalence** reasons. They do not assert identical
UI behavior: widening the preliminary reply predicate can turn a known
bare-subject ask into a safe hold. That difference is recorded explicitly rather
than presented as full semantic equality. The final per-file results determine
whether either reason is actually used.

The final reply/text binding tests in `tests/admission-round3-parity.test.cjs`,
the direct grammar regression in `tests/admission-round3-mutations.test.cjs`, and
the new whole-text grammar deletion exercise the stronger independent rule.
The new grammar mutant must run every test file and be killed.
