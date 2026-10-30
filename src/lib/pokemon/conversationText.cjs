'use strict';

// This is a bounded chat interpretation, not a catalog alias or fuzzy matcher.
// Never rewrite identifiers/links, and retain the original text in the message.
function normalize(text,maximum) {
  if (/https?:\/\/|www\.|\b(?:ja|en):/i.test(text)) return {text,notice:''};
  let original='';
  const normalized=text.replace(/(?<![\p{L}\p{N}_])pikacu(?![\p{L}\p{N}_])/giu,value=>{original||=value;return 'Pikachu';});
  if(normalized.length>maximum)return {text,notice:''};
  return {text:normalized,notice:original?`I interpreted “${original}” as “Pikachu” for this catalog query. Your original message is kept above.`:''};
}

function standaloneCardGoal(text) {
  // Replies about physical copies, choice, coordinates or source variants must
  // continue through the catalog's existing evidence/clarification handling.
  if (/\d|[:/]|\b(?:psa|bgs|cgc|grade[ds]?|grading|certificates?|authentic\w*|verify|verified|prices?|offers?|sellers?|buy|purchase|sell|shipping|payment|checkout|budget|holo\w*|reverse|foil|normal|master\s*ball|pok[eé]\s*ball|yes|confirm|select|choose|compare|instead|and|or|not|no|never|avoid|stop|without|except|exclude\w*|[a-z]+n['‘’ʼ]t|dont|cannot|do not|same|more|another|other|these|those|this|that)\b/i.test(text)) return false;
  const query=text.trim().replace(/[.!?。！]+$/u,'').replace(/^(?:please\s+)?(?:recommend|find|show(?:\s+me)?|search(?:\s+for)?)\s+/i,'');
  const match=/^(?:(?:Japanese|English)\s+)?([\p{L}\p{M}][\p{L}\p{M} '’.-]{0,79})\s+cards?$/iu.exec(query);
  if (!match) return false;
  const subject=match[1].trim();
  return !/^(?:(?:japanese|english|pokemon|pokémon|some|any|all|a|the|nice|good|new)\s*)+$/i.test(subject);
}

function missingSubject(result) {
  return result?.discovery?.task==='need_character_or_coordinates'
    && Array.isArray(result.candidate_cards)&&result.candidate_cards.length===0
    && !result.inventory&&Array.isArray(result.selection_blockers)
    && result.selection_blockers.every(value=>value==='supported_catalog_scope_needed')
    && (!result.next_step?.required_evidence||(Array.isArray(result.next_step.required_evidence)
      && result.next_step.required_evidence.every(value=>value==='explicit_character_artist_or_release_scope')))
    && ['evidence_or_scope_needed','no_candidates','followup_clarification_needed'].includes(result.status)
    && ['collection_evidence','collection_scope','scope_or_new_question'].includes(result.next_step?.field);
}

function conversationText(text,result) {
  const interpreted=normalize(text,result?200:2000),value=interpreted.text;
  if (!result) return {action:{type:'ask',question:value},notice:interpreted.notice};
  // Keep the existing reply length boundary, including after correction. A new
  // question never provides an implicit way around the 200-character limit.
  const bounded=text.length<=200&&value.length<=200;
  const explicit=/^(?:new\s+(?:collection\s+)?question)\s*(?:[:：]\s*|\s+)(.+)$/i.exec(value);
  const question=explicit?.[1].trim();
  const restart=bounded&&((question&&standaloneCardGoal(question))||(!explicit&&missingSubject(result)&&standaloneCardGoal(value)));
  return {action:restart?{type:'ask',question:question||value}:{type:'reply',text:value},notice:interpreted.notice};
}

module.exports={conversationText};
