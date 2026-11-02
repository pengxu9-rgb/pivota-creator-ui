'use strict';
const { copy } = require('../schema.cjs');
const { safeValue } = require('./privacy.cjs');
// Explicit scalars only. No arbitrary nested provider payload reaches the model.
const FIELDS = new Set(('id kind printing_ref language set_code collector_number finish name grade_kind grade_company grade_value condition_bucket currency source_ref source_url url evidence_ref availability certificate_ref status operation_ref order_ref quote_ref selection_ref task_ref route price_minor item_minor shipping_minor fee_minor tax_minor total_minor quantity rating_value rating_scale review_count state_version operation_revision observed_at expires_at synthetic source_permission physical_authenticity_verified').split(' '));
const REF = /^(?:id|.*_ref)$/;
function createContext(taskRef) {
    const known = new Set([taskRef]), sources = new Set(), listingIds = new Map(), retained = [];
    const scalar = v => v === null || ['string', 'number', 'boolean'].includes(typeof v);
    // origin 'interface' marks what the user already sees on screen (their own searches, selections, previews).
    function project(reply, origin = 'tool') {
        if (reply?.ok !== true)
            return safeValue({ synthetic: true, ok: false, error: { code: String(reply?.error?.code || 'invalid_tool_result').slice(0, 100), retry_class: 'none' } });
        const result = reply.result, records = [];
        if (result?.synthetic !== true || !Array.isArray(result.records))
            throw Error('invalid_tool_result');
        for (const record of result.records) {
            const source = record.source_ref || 'synthetic_fixture';
            if (!sources.has(source) && sources.size >= 3)
                continue;
            if (record.kind === 'offer') {
                const ids = listingIds.get(source) || new Set();
                if (!ids.has(record.id) && ids.size >= 3)
                    continue;
                ids.add(record.id);
                listingIds.set(source, ids);
            }
            sources.add(source);
            const row = { source_label: source, synthetic: true };
            for (const [key, value] of Object.entries(record))
                if (FIELDS.has(key) && scalar(value))
                    row[key] = typeof value === 'string' ? value.slice(0, 2000) : value;
            // Tool-shaped seller text is inert, explicitly quoted data, never instructions.
            for (const key of ['title', 'seller_name', 'description'])
                if (typeof record[key] === 'string')
                    row['quoted_' + key] = { source_label: source, quoted: record[key].slice(0, 400) };
            records.push(row);
        }
        // Register only references present in the bounded response, never hidden fields.
        const out = { synthetic: true, ok: true, ...(origin === 'interface' ? { shown_in_interface: true } : {}), tool: result.tool, status: String(result.status).slice(0, 100), state_version: result.state_version, records,
            assumptions: (result.assumptions || []).slice(0, 8).map(a => ({ field: String(a.field).slice(0, 100), value: String(a.value).slice(0, 160), label: String(a.label).slice(0, 240), confirmed: false })) };
        const safe = safeValue(out);
        for (const r of safe.records)
            for (const [key, value] of Object.entries(r))
                if (REF.test(key) && typeof value === 'string' && value !== '[private data omitted]')
                    known.add(value);
        retained.push(safe);
        if (retained.length > 12)
            retained.shift();
        return copy(safe);
    }
    function validateRefs(value, key = '') {
        if (Array.isArray(value)) {
            value.forEach(v => validateRefs(v, key.replace(/s$/, '')));
            return;
        }
        if (value && typeof value === 'object') {
            for (const [k, v] of Object.entries(value))
                validateRefs(v, k);
            return;
        }
        if ((key === 'ref' || /_ref$/.test(key)) && typeof value === 'string' && !known.has(value))
            throw Error('unknown_reference');
    }
    return Object.freeze({ project, validateRefs, has: ref => known.has(ref), snapshot: () => copy(retained), counts: () => ({ sources: sources.size, listings: Object.fromEntries([...listingIds].map(([k, v]) => [k, v.size])) }) });
}
module.exports = { createContext, FIELDS };
