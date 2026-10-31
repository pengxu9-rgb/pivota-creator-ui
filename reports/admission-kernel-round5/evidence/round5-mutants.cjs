'use strict';
const assert=require('node:assert/strict');
const KE='src/lib/pokemon/admission.cjs';
const once=(source,from,to)=>{assert.equal(source.split(from).length,2,'unique round5 mutation target: '+from);return source.replace(from,()=>to);};
const exact=row=>({...row,file:row.file||KE,mutate:source=>once(source,row.from,row.to)});
function adaptHistorical(row){
  const oldFrom=row.from,oldTo=row.to;
  if(!['R4_remove_stored_goal_positive','R4_remove_stored_ask_history_positive','R4_only_latest_stored_ask'].includes(row.id))return row;
  const from=oldFrom.replaceAll('storedQuestionAccepted(question,language)','storedQuestionAccepted(question)').replaceAll('storedQuestionAccepted(turn.question,language)','storedQuestionAccepted(turn.question)');
  const to=oldTo.replaceAll('storedQuestionAccepted(question,language)','storedQuestionAccepted(question)').replaceAll('storedQuestionAccepted(turn.question,language)','storedQuestionAccepted(turn.question)');
  return exact({...row,from,to,historical_transform:{from:oldFrom,to:oldTo},retarget_reason:'R5-1 removes the workspace-language argument from storedQuestionAccepted; delete the same stored-goal/history guard using its unchanged one-argument call.'});
}
function reviewDefinitions(){
  // Exact seven transforms from Claude's round-5 harness. Replacements use a
  // callback: dollar-plus-quote text must stay literal, not String.replace's
  // matched-suffix substitution syntax.
  return [
    {id:'R5_server_record_unanchored',from:"')$'));\n  if(inspect&&inspect[0]===question)return true;",to:"')'));\n  if(inspect)return true;"},
    {id:'R5_server_record_case_insensitive',from:"new RegExp('^Inspect catalog record ('+id+')$')",to:"new RegExp('^Inspect catalog record ('+id+')$','i')"},
    {id:'R5_stored_ignores_commercial',from:'if(signals.money||signals.grade||signals.sets.length>1',to:'if(signals.sets.length>1'},
    {id:'R5_stored_allows_non_ex_forms',from:"return !!accepted&&(!accepted.identity?.form||accepted.identity.form==='ex')||positive?.answer===true;",to:'return !!accepted||positive?.answer===true;'},
    {id:'R5_stored_language_answer_any',from:"return !!accepted&&(!accepted.identity?.form||accepted.identity.form==='ex')||positive?.answer===true;",to:"return !!accepted&&(!accepted.identity?.form||accepted.identity.form==='ex')||positive?.answer!==false;"},
    {id:'R5_stored_check_skips_refine',from:"if(!['recommendation_status','model_explanation','language_clarification','model_clarification'].includes(action.type)&&!storedGoalsAccepted(current))",to:"if(!['recommendation_status','model_explanation','language_clarification','model_clarification','refine'].includes(action.type)&&!storedGoalsAccepted(current))"},
    {id:'R5_stored_unaccepted_language_ignored',from:'||signals.languages.length&&!positive&&!explicitLegacySubject)return false;',to:')return false;'},
  ].map(row=>exact({...row,group:'claude_round5'}));
}
const ownLanguage="  const language=positive?.language||(explicitLegacySubject?languageCode(previous.match(/^(English|Japanese)\\s+/i)?.[1]||''):null);";
function definitions(){
  return [...reviewDefinitions(),
    {id:'R5_stored_uses_current_language',file:KE,group:'round5_stored_replay',rule:'a stored ask must use its own accepted language, or none, rather than the current workspace language',
      transformations:[
        {from:'function storedQuestionAccepted(question){',to:'function storedQuestionAccepted(question,currentLanguage){'},
        {from:ownLanguage,to:'  const language=positive?.language||currentLanguage;'},
        {from:'!storedQuestionAccepted(question))return false;',to:'!storedQuestionAccepted(question,rememberedLanguage({},current)))return false;'},
        {from:"turn?.type==='ask'&&!storedQuestionAccepted(turn.question)",to:"turn?.type==='ask'&&!storedQuestionAccepted(turn.question,rememberedLanguage({},current))"},
      ],
      mutate(source){for(const change of this.transformations)source=once(source,change.from,change.to);return source;}},
    exact({id:'R5_skip_stored_reply_readmission',file:KE,group:'round5_stored_replay',rule:'every stored reply must be re-admitted before any native replay',
      from:"    if(session.turns.some(turn=>turn?.type==='reply'&&!storedReplyAccepted(turn.text)))return false;",to:''}),
    exact({id:'R5_stored_reply_accepts_any_text',file:KE,group:'round5_stored_replay',rule:'stored replies have only field-independent narrow forms',
      from:'function storedReplyAccepted(text){',to:'function storedReplyAccepted(text){ return true; // mutant: arbitrary stored reply prose\n'}),
    exact({id:'R5_stored_ignores_trim_parity',file:KE,group:'round5_stored_replay',rule:'neither raw syntax nor language forwarding can recover a stored question whose edge whitespace ask-time admission rejects',
      from:'if(previous!==previous.trim()||previous.length>2000)return false;',
      to:'if(previous.length>2000)return false;'}),
    exact({id:'R5_stored_ignores_normalized_length_parity',file:KE,group:'round5_stored_replay',rule:'a stored ask must satisfy the same post-NFKC size bound as ask-time admission, even when the raw string is shorter',
      from:'if(previous!==previous.trim()||previous.length>2000)return false;',
      to:'if(previous!==previous.trim())return false;'}),
    exact({id:'R5_stored_forwarding_ignores_length_parity',file:KE,group:'round5_stored_replay',rule:'the reconstructed stored ask must satisfy the same forwarded-question size bound as ask-time admission',
      from:'if(forwarded.length<=2000)accepted=catalogSyntax(forwarded,extractSignals(forwarded),language,null);',
      to:'accepted=catalogSyntax(forwarded,extractSignals(forwarded),language,null);'}),
  ];
}
module.exports={adaptHistorical,reviewDefinitions,definitions,once};
