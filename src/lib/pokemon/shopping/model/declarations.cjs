'use strict';
// Offline evaluation only. Privacy projection and provider-schema conversion
// have independent manifests; neither changes the original facade contracts.
const { declarations, hash, copy, validateRequest } = require('../schema.cjs');
const PRIVATE = new Set(['human_action_ref', 'destination_ref', 'approval_ref', 'contact', 'address', 'credentials']);
const SUPPORTED = new Set(['type', 'properties', 'required', 'items', 'enum', 'description', 'minimum', 'maximum', 'minItems', 'maxItems', 'nullable']);
const object = v => v && typeof v === 'object' && !Array.isArray(v);
function project(schema, path = '', removed = []) {
    const out = copy(schema);
    if (out.properties) {
        for (const [key, value] of Object.entries(out.properties)) {
            if (PRIVATE.has(key)) {
                removed.push({ path: path + '/properties/' + key, reason: 'private_host_binding', schema_sha256: hash(value) });
                delete out.properties[key];
                out.required = (out.required || []).filter(x => x !== key);
            }
            else
                out.properties[key] = project(value, path + '/properties/' + key, removed);
        }
    }
    if (out.items)
        out.items = project(out.items, path + '/items', removed);
    for (const key of ['anyOf', 'oneOf'])
        if (out[key])
            out[key] = out[key].map((s, i) => project(s, path + '/' + key + '/' + i, removed));
    return out;
}
function convert(schema, path = '', dropped = []) {
    const out = {};
    for (const [key, value] of Object.entries(schema)) {
        if (!SUPPORTED.has(key)) {
            dropped.push({ path, keyword: key, value_sha256: hash(value) });
            continue;
        }
        if (key === 'properties')
            out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, convert(v, path + '/properties/' + k, dropped)]));
        else if (key === 'items')
            out[key] = convert(value, path + '/items', dropped);
        else
            out[key] = copy(value);
    }
    // Existing untyped enums contain strings. Vertex's enum needs an explicit type.
    if (out.enum && !out.type && out.enum.every(x => typeof x === 'string'))
        out.type = 'string';
    return out;
}
function declarationSet() {
    const privacy = [], dropped = [], list = declarations().map(d => {
        const removed = [], loss = [];
        const parameters = convert(project(d.parameters, '', removed), '', loss);
        privacy.push(...removed.map(r => ({ tool: d.name, ...r })));
        dropped.push(...loss.map(r => ({ tool: d.name, ...r })));
        return { name: d.name, description: d.description, parameters };
    });
    return { declarations: list, privacy_projection: privacy, dropped_keywords: dropped, declaration_sha256: hash(list), privacy_projection_sha256: hash(privacy), dropped_keywords_sha256: hash(dropped) };
}
function rejectPrivate(value) { if (Array.isArray(value)) {
    value.forEach(rejectPrivate);
    return;
} if (object(value))
    for (const [k, v] of Object.entries(value)) {
        if (PRIVATE.has(k))
            throw Error('model_private_argument');
        rejectPrivate(v);
    } }
function publicArgs(value) { if (Array.isArray(value))
    return value.map(publicArgs); if (object(value))
    return Object.fromEntries(Object.entries(value).filter(([k]) => !PRIVATE.has(k)).map(([k, v]) => [k, publicArgs(v)])); return value; }
function containsPrivate(value) { if (Array.isArray(value))
    return value.some(containsPrivate); return object(value) && Object.entries(value).some(([k, v]) => PRIVATE.has(k) || containsPrivate(v)); }
function bindArguments(name, args, existingBindings = {}) {
    rejectPrivate(args);
    // A private-bearing contract requires an exact pre-existing host payload.
    // No callback can mint action/consent in response to a model request.
    const original = declarations().find(d => d.name === name);
    if (!original)
        throw Error('unknown_function');
    const needsPrivate = declarationSet().privacy_projection.some(r => r.tool === name);
    let full = copy(args);
    if (needsPrivate) {
        const bound = existingBindings[name];
        if (!bound || !containsPrivate(bound) || hash(publicArgs(bound)) !== hash(args))
            throw Error('private_binding_unavailable');
        full = copy(bound);
    }
    return validateRequest(name, full); // Full original schema, including dropped keywords.
}
module.exports = { declarationSet, project, convert, bindArguments, rejectPrivate, publicArgs, PRIVATE };
