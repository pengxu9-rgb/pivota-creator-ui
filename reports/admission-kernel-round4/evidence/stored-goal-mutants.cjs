'use strict';
const assert=require('node:assert/strict');
const KE='src/lib/pokemon/admission.cjs',PC='src/lib/pokemon/vendor/privateCollector.cjs';
const once=(source,from,to)=>{assert.equal(source.split(from).length,2,'unique stored-goal mutation target: '+from);return source.replace(from,to);};
function definitions(){
  return [
    {id:'R4_remove_stored_workspace_admission',file:KE,rule:'every executable catalog follow-up must re-admit visible stored goal/history',
      from:"  if(!['recommendation_status','model_explanation','language_clarification','model_clarification'].includes(action.type)&&!storedGoalsAccepted(current))local('task','catalog_stored_goal_requires_restart');",to:''},
    {id:'R4_remove_stored_goal_positive',file:KE,rule:'invalid legacy goal must hold even when no history is visible',
      from:'  if(question!==undefined&&question!==null&&!storedQuestionAccepted(question,language))return false;',to:''},
    {id:'R4_remove_stored_ask_history_positive',file:KE,rule:'every stored ask must satisfy current positive admission',
      from:"    if(!Array.isArray(session.turns)||session.turns.some(turn=>turn?.type==='ask'&&!storedQuestionAccepted(turn.question,language)))return false;",to:''},
    {id:'R4_only_latest_stored_ask',file:KE,rule:'a later valid ask cannot cleanse earlier unsafe turns that native will replay',
      from:"session.turns.some(turn=>turn?.type==='ask'&&!storedQuestionAccepted(turn.question,language))",to:"session.turns.filter(turn=>turn?.type==='ask').slice(-1).some(turn=>!storedQuestionAccepted(turn.question,language))"},
    {id:'R4_remove_stored_server_record_exception',file:KE,rule:'exact server-generated inspect/compare goals retain follow-up authority',
      from:'  if(serverRecordQuestion(question))return true;',to:'',stricter_only:true,
      classification_reason:'Stricter-only deletion: exact server-generated record goals would be refused. Positive controls pin this required exception; it does not represent a safety bypass.'},
    {id:'R4_remove_private_replay_admission',file:PC,rule:'locked authoritative history must be re-admitted because public views hide session.turns',
      from:"        if(!require('../admission.cjs').storedGoalsAccepted(record))fail('catalog_stored_goal_requires_restart');",to:''},
  ].map(row=>({...row,group:'round4_stored_goals',mutate:source=>once(source,row.from,row.to)}));
}
module.exports={definitions};
