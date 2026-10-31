'use strict';
const {attempts}=require('../../../tests/helpers/strict-network-guard.cjs');
const assert=require('node:assert/strict');
const {admit}=require('../../../src/lib/pokemon/admission.cjs');
const {routeChatText}=require('../../../src/lib/pokemon/chatTextIntent.cjs');
const {rows,frames}=require('../../admission-kernel/evidence/corpus.cjs');
const claude=require('./claude-clarification-labels.json');
const {context}=require('./parity-matrix.cjs');
const {hash,startAudit,finishAudit,write}=require('./audit.cjs');
const audit=startAudit(__filename),labels=new Map(claude.rows.map(row=>[row.text,row]));
const uniqueRows=[...new Map(rows.map(row=>[row.text,row])).values()];
const values=uniqueRows.map((row,index)=>{
  const ctx=context(row.priorLanguage);delete ctx.current.result.next_step;
  const candidate=routeChatText(row.text,ctx.current,ctx.doc),plan=admit({...ctx,candidate,text:row.text,ingress:'text'});
  const label=labels.get(row.text);assert.ok(label,'review relabel is incomplete: '+row.text);assert.equal(label.id,row.id);
  const clarified=!!plan.hold||['language_clarification','model_clarification'].includes(plan.action.type);
  return {...row,index:index+1,claude_label:label.claude_label,route:'deterministic model-off text',clarified,action:plan.action,hold:plan.hold,language_preference:plan.languagePreference};
});
assert.equal(values.length,claude.unique_texts);
const metric=selected=>({denominator:selected.length,clarifications:selected.filter(row=>row.clarified).length,rate:selected.length?selected.filter(row=>row.clarified).length/selected.length:null});
const original={all:metric(values),by_label:Object.fromEntries(['clear_supported','clear_unsupported','ambiguous'].map(label=>[label,metric(values.filter(row=>row.label===label))])),literal_unnecessary_clarification_rate:metric(values.filter(row=>row.label!=='ambiguous'))};
const expressible=values.filter(row=>row.claude_label==='expressible'),required=values.filter(row=>row.claude_label==='required_hold'),offtopic=values.filter(row=>row.claude_label==='off_topic');
const reviewed={expressible:{...metric(expressible),unnecessary_clarifications:expressible.filter(row=>row.clarified).length},required_hold:{denominator:required.length,held:required.filter(row=>row.clarified).length,missed:required.filter(row=>!row.clarified).length},off_topic:{denominator:offtopic.length,misrouted_to_catalog:offtopic.filter(row=>!row.clarified&&row.action.type==='ask').length}};
const output={schema:'pot.admission.clarification-corpus.round2.v1',...finishAudit(audit),method:'Fixed original 150 unique texts. Each is routed deterministically with the model off, then admitted. The unchanged original Codex labels and unchanged Claude relabel JSON are both applied to the same measured outcomes. No matrix repetition is included in denominators. No holds were loosened to improve this metric.',corpus_fixture_rows:rows.length,unique_texts:values.length,frames_per_language:frames.length,original_codex_labels:original,claude_labels:reviewed,original_corpus_sha256:hash(require.resolve('../../admission-kernel/evidence/corpus.cjs')),claude_label_sha256:hash(require.resolve('./claude-clarification-labels.json')),network_attempts:attempts.length,exact_exit_code:0,rows:values};
if(attempts.length||!output.source_hashes_unchanged||!output.test_hashes_unchanged||!output.evidence_inputs_unchanged||!output.source_head_unchanged){output.exact_exit_code=1;process.exitCode=1;}
write('clarification-rate.json',output);
console.log(JSON.stringify({original_codex_labels:original,claude_labels:reviewed,network_attempts:attempts.length,exit_code:output.exact_exit_code}));
