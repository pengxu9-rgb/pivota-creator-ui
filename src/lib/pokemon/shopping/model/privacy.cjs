'use strict';
const { hash } = require('../schema.cjs');
const POLICY = Object.freeze({ version: 'shopping.model-privacy.v1', private_event: 'fail_closed_before_transport', synthetic_private_values: ['dest_hk', 'dest_us', 'Hong Kong', 'United States'], patterns: ['email', 'phone', 'destination labels', 'contact/address fields'], native_text: 'original only; never feed a redacted model view to native admission' });
const privateText = text => typeof text === 'string' && (/dest_(?:hk|us)|Hong\s*Kong|United\s*States|\b(?:destination|address|contact|phone|email)\b|\bdelivered\s+to\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d ().-]{7,}\d/i.test(text));
function safeValue(value) { if (Array.isArray(value))
    return value.map(safeValue); if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).filter(([k]) => !/(?:destination|contact|address|credential|approval|human_action)/i.test(k)).map(([k, v]) => [k, safeValue(v)])); return privateText(value) ? '[private data omitted]' : value; }
module.exports = { POLICY, privateText, safeValue, privacy_sha256: hash(POLICY) };
