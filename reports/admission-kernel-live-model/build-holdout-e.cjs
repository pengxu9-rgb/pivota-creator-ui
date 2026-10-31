'use strict';
// Post-fix only. Reproduce the supplied holdout contexts without adapting the
// product, prompt, labels or cases after seeing the held-out texts.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const guard=require('../../tests/helpers/strict-network-guard.cjs');
const {context:parityContext}=require('../admission-kernel-round3/evidence/parity-matrix.cjs');
const {createFixture,binding,planView,FIXED_NOW}=require('./offline-fixture.cjs');
const {routeChatText}=require('../../src/lib/pokemon/chatTextIntent.cjs');
const {admit}=require('../../src/lib/pokemon/admission.cjs');
const {buildModelInput}=require('../../src/lib/pokemon/modelTurn.cjs');
const ROOT=path.resolve(__dirname,'../..'),FIX='cf5f7b1e642302593af0cd6bf694f8616a6a840f';
const AD='c1c9912e16c7a491387f8d3e24c59493bfce5fd4f6437a72eaecaa9f26dafd73';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
async function main(sourceFile){
  assert.ok((process.env.NODE_OPTIONS||'').includes('strict-network-guard.cjs'));
  cp.execFileSync('git',['merge-base','--is-ancestor',FIX,'HEAD'],{cwd:ROOT});
  assert.equal(sha(fs.readFileSync(path.join(ROOT,'src/lib/pokemon/modelTurn.cjs'))),'dbbffa4f9935bcadb6afee08bf1d8fe78fb95bd45891e75d891886c4371ca2e0');
  const sourceBytes=fs.readFileSync(sourceFile),source=JSON.parse(sourceBytes);
  assert.equal(source.schema,'pot.admission.live-model-holdout.v1');assert.equal(source.entries.length,40);
  assert.equal(sha(fs.readFileSync(path.join(__dirname,'corpus.json'))),AD);
  // The source explicitly defines fresh as no current result. The set-A
  // parity helper still returns one even for null language, so retain its
  // null-language doc and explicitly remove the result/workspace reference.
  const fresh={doc:{...structuredClone(parityContext(null).doc),workspaceId:null},current:null};
  const fixture=createFixture();await fixture.action({type:'ask',question:'Find Charizard cards'});
  const withResult=fixture.snapshot();assert.equal(fixture.calls.length,1);
  assert.equal(withResult.current.result.next_step.field,'variant');
  assert.deepEqual(withResult.current.result.preferences,{});assert.deepEqual(withResult.current.result.scope_filters,{});
  const contexts=ordered({fresh,with_result:withResult}),ids=new Set();
  const entries=source.entries.map((row,index)=>{
    assert.ok(Object.hasOwn(contexts,row.context));assert.equal(typeof row.text,'string');assert.ok(row.text.length>0&&row.text.length<=2000);
    const context=structuredClone(contexts[row.context]),candidate=routeChatText(row.text,context.current,context.doc);
    const plan=admit({...context,candidate,text:row.text,ingress:'text',binding:binding(context),now:()=>FIXED_NOW});
    const entry={id:'holdout-e-'+String(index+1).padStart(2,'0'),text:row.text,group:row.group,context_name:row.context,context,sets:['E'],
      source_file:'HOLDOUT_SET_E.json',source_index:index,depends_on:[],
      model_off:{candidate:structuredClone(candidate),plan:planView(plan),clarified:!!plan.hold||['language_clarification','model_clarification'].includes(plan.action.type)},
      input_sha256:sha(JSON.stringify(buildModelInput({...context,text:row.text})))};
    assert.ok(!ids.has(entry.id));ids.add(entry.id);return entry;
  });
  const value=ordered({schema:'pot.admission.frozen-holdout-e.v1',fix_commit:FIX,source_sha256:sha(sourceBytes),corpus_sha256:AD,
    source_context_definitions:source.contexts,context_methods:{fresh:'Set-A parity doc with priorLanguage null, workspaceId null and current null; explicit no-current-result source definition governs.',with_result:'Real in-memory conversation/private workspace after the round-6 safe typed ask seed, pending variant prompt; no language, budget or grade preloaded.'},
    source_entries:source.entries,entries});
  const output=path.join(__dirname,'holdout-e.json');assert.equal(fs.existsSync(output),false,'never overwrite a frozen holdout');
  fs.writeFileSync(output,JSON.stringify(value)+'\n',{flag:'wx'});assert.equal(guard.attempts.length,0);
  console.log(JSON.stringify({fix_commit:FIX,source_sha256:value.source_sha256,holdout_e_sha256:sha(fs.readFileSync(output)),entries:entries.length,context_counts:Object.fromEntries(Object.keys(contexts).map(name=>[name,entries.filter(row=>row.context_name===name).length])),network_attempts:0}));
}
module.exports={main};if(require.main===module)main(process.argv[2]).catch(error=>{console.error(error);process.exitCode=1;});
