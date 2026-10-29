'use strict';
// Project only accepted, retained canonical replay state. Never expose the replay.
const kinds=new Set(['ask','reply','refine','inventory','resolve_owned','preferences','feedback','compare','choose_comparison','select','clear_target','page']);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=(v,max)=>typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
function workspaceFeedback(session,result){
  if(!exact(session,['schema','turns','limit','expected_revision'])||session.schema!=='pokemon.pivota-collector-session.v1'||!Array.isArray(session.turns)||!session.turns.length||session.turns.length>20||!Number.isInteger(session.limit)||session.limit<1||session.limit>50||typeof session.expected_revision!=='string'||!/^[a-f0-9]{64}$/.test(session.expected_revision)||session.expected_revision!==result?.catalog_revision||result?.turn_count!==session.turns.length||session.turns[0]?.type!=='ask')return {};
  const reactions=new Map();
  for(const turn of session.turns){
    if(!turn||typeof turn!=='object'||Array.isArray(turn)||!kinds.has(turn.type))return {};
    if(turn.type==='ask'){
      if(!exact(turn,['type','question'])||typeof turn.question!=='string'||!turn.question.trim()||turn.question.length>2000)return {};
      reactions.clear();
    }else if(turn.type==='feedback'){
      if(!exact(turn,['type','card_id','reaction'])||!text(turn.card_id,160)||!['like','dismiss','clear'].includes(turn.reaction))return {};
      if(turn.reaction==='clear')reactions.delete(turn.card_id);else reactions.set(turn.card_id,turn.reaction);
    }
  }
  return Object.fromEntries(reactions);
}
module.exports={workspaceFeedback};
