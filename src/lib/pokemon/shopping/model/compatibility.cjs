'use strict';
const { copy, hash } = require('../schema.cjs');
const { buildModelInput, validateModelProposal, projectModelAction } = require('../../modelTurn.cjs');
// A model answer is an answer plan, not authority. The existing interpreter
// candidate is constructed by the host from original text/context, then admitted.
function bridge(entry, context, answer, { routeChatText, admit, binding, now }) {
    const native = routeChatText(entry.text, context.current, context.doc), a = native.action;
    const proposal = { schema: 'pokemon.interpret-turn.v1', state_version: context.doc.version, intent: 'clarify', source_spans: [], explanation_key: 'none', clarification_field: 'compound' };
    if (!['clarify', 'hold'].includes(answer?.decision)) {
        const intents = { ask: 'search', reply: 'reply', refine: 'refine_language', recommendation_status: 'status', model_explanation: 'explain' };
        if (intents[a.type]) {
            proposal.intent = intents[a.type];
            proposal.clarification_field = 'none';
            if (proposal.intent === 'explain')
                proposal.explanation_key = a.key;
        }
        if (['search', 'refine_language'].includes(proposal.intent)) {
            const language = entry.text.match(/\b(?:English|Japanese)\b|英語|英文|英版|日本語|日文|日版/i)?.[0];
            if (language)
                proposal.source_spans.push({ field: 'language', text: language });
        }
    }
    if (answer?.decision === 'clarify')
        proposal.clarification_field = ['language', 'character', 'release', 'number', 'finish', 'compound', 'task'].includes(answer.fields?.[0]) ? answer.fields[0] : 'compound';
    let candidate;
    try {
        validateModelProposal(proposal, buildModelInput({ ...context, text: entry.text }));
        candidate = projectModelAction(proposal, { ...context, text: entry.text });
    }
    catch {
        Object.assign(proposal, { intent: 'clarify', source_spans: [], explanation_key: 'none', clarification_field: 'compound' });
        candidate = projectModelAction(proposal, { ...context, text: entry.text });
    }
    const plan = admit({ ...context, text: entry.text, candidate, ingress: 'text', binding: binding(context), now });
    const clarify = answer?.decision === 'clarify';
    const held = !!plan.hold || ['language_clarification', 'model_clarification'].includes(plan.action.type);
    const classification = clarify ? 'clarify' : held ? 'hold' : plan.kind === 'catalog' ? 'search' : 'answer';
    return { candidate, plan, classification, clarified: held, asked_question: clarify, binding_held: held, proposal: copy(proposal), input_sha256: hash(JSON.stringify(buildModelInput({ ...context, text: entry.text }))) };
}
function mapping(corpus, holdout) {
    const entries = [...corpus.entries, ...holdout.entries];
    if (entries.length !== 389 || new Set(entries.map(e => e.id)).size !== 389)
        throw Error('original_389_required');
    return { schema: 'shopping.phase3.compatibility-map.v1', counts: { A_D: 349, E: 40, total: 389, passes_per_arm: 2 },
        context_policy: 'Original texts and contexts are immutable. Dynamic C replays actual arm/pass predecessor records with the existing dynamic-context controller; unreachable rows remain failures. No baseline seed.',
        model_input: 'One original user text, a privacy allowlisted projection of actual buildModelInput context, and scoped synthetic task reference. No context-oracle label or model-off outcome is sent.',
        decision_policy: 'Clarify = explicit valid answer-plan clarification. Search = original-text native admitted catalog action with no hold; model calls alone do not count. Hold = native admission hold or explicit model hold. Wrong or unknown output falls back, with failure retained.',
        predecessor_policy: 'Store the bridge-generated valid legacy proposal and actual buildModelInput SHA for each context. Reconstruct dynamic C from only same arm/pass actual records; never use frozen C baseline as replacement.',
        entries: entries.map(e => ({ id: e.id, sets: e.sets, text: e.text, original_input_sha256: e.input_sha256, frozen_context_sha256: hash(e.context), dynamic: e.sets.includes('C'), depends_on: e.depends_on || [], expressible: e.sets.includes('A') && e.labels?.includes?.('expressible') || e.label === 'expressible' })) };
}
module.exports = { mapping, bridge };
