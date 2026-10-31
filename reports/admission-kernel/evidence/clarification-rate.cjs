'use strict';
const {attempts}=require('../../../tests/helpers/strict-network-guard.cjs');
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {admit}=require('../../../src/lib/pokemon/admission.cjs');
const {routeChatText}=require('../../../src/lib/pokemon/chatTextIntent.cjs');
const {rows,frames}=require('./corpus.cjs');
const prefs={currency:'USD',budget_minor:100000,grade_company:'PSA',grade_value:'10'};
const uniqueRows=[...new Map(rows.map(row=>[row.text,row])).values()];
const values=uniqueRows.map((row,index)=>{
  const current={id:'offline-workspace',version:3,result:{goal_question:'Find Pikachu cards',scope_filters:{language:row.priorLanguage},discovery:{languages:[row.priorLanguage],task:'character_cards'},preferences:prefs,candidate_cards:[]}};
  const doc={id:'offline-chat',version:7,languagePreference:row.priorLanguage,messages:[]};
  const binding={owner:'offline-corpus-owner',chatId:doc.id,stateVersion:7,workspaceId:current.id,workspaceVersion:3,deadline:30000};
  const candidate=routeChatText(row.text,current,doc),plan=admit({candidate,text:row.text,ingress:'text',binding,current,doc,now:()=>1000});
  const clarified=!!plan.hold||['language_clarification','model_clarification'].includes(plan.action.type);
  return {...row,index:index+1,route:'deterministic model-off text',clarified,action:plan.action,hold:plan.hold,language_preference:plan.languagePreference};
});
const group=label=>{
  const chosen=values.filter(row=>label===null||row.label===label),clarified=chosen.filter(row=>row.clarified).length;
  return {denominator:chosen.length,clarifications:clarified,rate:chosen.length?clarified/chosen.length:null};
};
const clear=values.filter(row=>row.label!=='ambiguous'),clearClarified=clear.filter(row=>row.clarified).length;
const output={schema:'pot.admission.clarification-corpus.v1',source_head:execFileSync('git',['rev-parse','HEAD'],{cwd:path.resolve(__dirname,'../../..'),encoding:'utf8'}).trim(),method:'Fixed unique-text corpus, deterministic model-off route followed by shared admission. Each unique text counted once, not multiplied by matrix repetitions. Labels were fixed in corpus.cjs before measuring. This is offline fixture evidence, not a deployed user success estimate.',
  labels:{clear_supported:'One clear meaning for a catalog task or local status control, including bare Lucario/Vaporeon names that the current narrow grammar does not recognize.',clear_unsupported:'One clear meaning outside supported pilot grammar, including language exclusion/metalinguistic frames and search-plus-preference compounds; intentionally included in the all-clear denominator.',ambiguous:'Multiple meanings or a missing required unit.'},
  corpus_fixture_rows:rows.length,unique_texts:uniqueRows.length,all:group(null),by_label:Object.fromEntries(['clear_supported','clear_unsupported','ambiguous'].map(label=>[label,group(label)])),
  requested_literal_unnecessary_clarification_rate:{definition:'Clarifies despite a pre-labeled single clear meaning, INCLUDING clear unsupported requests. Conservative literal metric from the brief; required out-of-grammar refusals/holds are counted here and separately labeled.',denominator:clear.length,clarifications:clearClarified,rate:clear.length?clearClarified/clear.length:null},
  supported_only_supplement:group('clear_supported'),frames_per_language:frames.length,network_attempts:attempts.length,rows:values};
fs.writeFileSync(path.join(__dirname,'../clarification-rate.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({all:output.all,by_label:output.by_label,literal_metric:output.requested_literal_unnecessary_clarification_rate,network_attempts:output.network_attempts}));
if(attempts.length)throw Error('unexpected_network_attempt');
