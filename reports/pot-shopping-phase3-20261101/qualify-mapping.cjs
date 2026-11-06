'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../..'), { hash } = require(ROOT + '/src/lib/pokemon/shopping/schema.cjs');
const { bridge } = require(ROOT + '/src/lib/pokemon/shopping/model/compatibility.cjs'), { privateText } = require(ROOT + '/src/lib/pokemon/shopping/model/privacy.cjs');
const corpus = require('../admission-kernel-live-model/corpus.json'), holdout = require('../admission-kernel-live-model/holdout-e.json'), old = require('../admission-kernel-live-model/proposals.json');
const dynamic = require('../admission-kernel-live-model/dynamic-context.cjs');
const { routeChatText } = require(ROOT + '/src/lib/pokemon/chatTextIntent.cjs'), { admit } = require(ROOT + '/src/lib/pokemon/admission.cjs'), { buildModelInput, validateModelProposal } = require(ROOT + '/src/lib/pokemon/modelTurn.cjs'), { binding, FIXED_NOW } = require('../admission-kernel-live-model/offline-fixture.cjs');
(async () => { const rows = []; for (const pass of [1, 2])
    for (const e of [...corpus.entries, ...holdout.entries]) {
        const state = e.sets.includes('C') ? await dynamic.contextFor(e, pass, old.records) : { context: e.context };
        if (state.unreachable) {
            rows.push({ id: e.id, pass, unreachable: true, reason: state.reason });
            continue;
        }
        const context = state.context, r = bridge(e, context, { decision: 'search', fields: [] }, { routeChatText, admit, binding, now: () => FIXED_NOW });
        validateModelProposal(r.proposal, buildModelInput({ ...context, text: e.text }));
        rows.push({ id: e.id, pass, proposal: r.proposal, input_sha256: r.input_sha256, classification: r.classification, asked_question: r.asked_question, binding_held: r.binding_held, private_event: privateText(e.text) });
    } assert.equal(rows.length, 778); const result = { schema: 'shopping.phase3.mapping-qualification.v1', historical_proposals_only: true, new_model_calls: 0, rows: rows.length, dynamic_rows: rows.filter(r => r.id.startsWith('turn-') && corpus.entries.find(e => e.id === r.id)?.sets.includes('C')).length, unreachable: rows.filter(r => r.unreachable).map(r => ({ id: r.id, pass: r.pass, reason: r.reason })), note: 'Historical proposals validate the existing reconstruction recipe only; not model-arm results. Unreachable cases remain failures. New bridges are valid legacy proposals and bind actual input hashes; future reconstruction must use actual arm/pass records.', bridge_rows_sha256: hash(rows) }; fs.writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n'); process.stdout.write(JSON.stringify(result) + '\n'); })().catch(e => { process.stderr.write(e.stack + '\n'); process.exitCode = 1; });
