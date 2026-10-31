'use strict';

const LANGUAGES={en:'English',ja:'Japanese'};
// Deterministic candidate router. Every route, including rerouted replies,
// still requires admission.cjs before any catalog or commerce invocation.
const releaseHints=require('./chatReleaseHints.json');
function explicitLanguage(text){
  const en=/\benglish\b|英語|英文|英版/i.test(text),ja=/\bjapanese\b|日本語|日文|日版/i.test(text);
  return en&&ja?'both':en?'en':ja?'ja':null;
}
function languageAnswer(text){
  const match=text.match(/^(english|japanese|英語|英文|英版|日本語|日文|日版)(?:\s*[,;.]?\s*(?:only|please|no preference(?:s)?(?:\s+(?:on|for))?\s+(?:(?:the\s+)?(?:others?|rest)|anything else)|(?:the\s+)?(?:others?|rest)\s+(?:do not|don't) matter))?[.!。]*$/i);
  return match?explicitLanguage(match[1]):null;
}
function routeChatText(text,current,{languagePreference=null,languageClarificationPending=false}={}){
  text=text.trim();
  const explicit=explicitLanguage(text),goalLanguage=explicitLanguage(current?.result?.goal_question||''),remembered=LANGUAGES[current?.result?.scope_filters?.language]?current.result.scope_filters.language:
    LANGUAGES[languagePreference]?languagePreference:
      LANGUAGES[goalLanguage]?goalLanguage:null;
  if(current&&/(?:not|no|except|excluding|avoid|without)\s+(?:only\s+)?(?:english|japanese)\b|(?:english|japanese)\s+(?:is not|isn't|not)\b/i.test(text))
    return {action:{type:'language_clarification'},languagePreference:LANGUAGES[remembered]?remembered:null};
  const answer=languageAnswer(text);
  const explicitCardQuestion=explicit&&explicit!=='both'&&
    /^(?:(?:find|show|search(?: for)?|recommend|suggest|inspect|compare)\s+)?(?:english|japanese)\b/i.test(text)&&
    /\bcards?\b|\bset\b|\d{1,3}\/[a-z0-9-]+/i.test(text);
  if(current&&languageClarificationPending&&!answer&&!explicitCardQuestion)
    return {action:{type:'language_clarification'},languagePreference:LANGUAGES[remembered]?remembered:null};
  const language=explicit==='both'?null:explicit||remembered||null;
  const plain=text.toLowerCase().replace(/[?!.\/,;:]+$/g,'').trim().replace(/\s+/g,' ');
  if(current&&/^(?:(?:have|did) you (?:already )?(?:recommend|recommended|suggest|suggested)(?: the| any)? cards|(?:where|what) are (?:my|the|your) (?:recommendations|cards)|show (?:me )?(?:my|the|your) recommendations|recommend cards)$/.test(plain))
    return {action:{type:'recommendation_status'},languagePreference:language};
  if(current?.result&&answer)
    return {action:{type:'refine',scope:{language:answer}},languagePreference:answer};
  if(current?.result&&(/^(?:yes|confirm|yes, that one|holo|normal|reverse holo|reverse|はい|确认|是)[.!。]*$/i.test(text)||/^\d{1,3}\/[a-z0-9-]{1,32}[.!。]?$/i.test(text)))
    return {action:{type:'reply',text},languagePreference:language};
  const coordinate=/\d{1,3}\/[a-z0-9-]{1,32}/i;
  const bareCoordinate=/^\d{1,3}\/[a-z0-9-]{1,32}[.!。]?$/i.test(text);
  const newQuestion=explicitCardQuestion||!current?.result||text.length>200||
    (!bareCoordinate&&coordinate.test(text))||
    /^(?:(?:can|could|would|will)\s+you\b|which\b|what\b|where\b|how\b|why\b|find\b|show\b|recommend\b|suggest\b|search\b|compare\b|inspect\b|look\b|list\b|start\b|new\b|switch\b|instead\b|tell\b)/i.test(text)||
    /\bcards?\s+(?:from|in)\s+(?:the\s+)?set\s+\S+/i.test(text)||
    current?.result?.discovery?.task==='need_character_or_coordinates';
  if(newQuestion){
    // A new explicit request resets catalog scope, never a selected target.
    // Keep the language choice without changing a supplied name or fraction.
    const question=!explicit&&LANGUAGES[language]?LANGUAGES[language]+' '+text:text;
    return {action:{type:'ask',question},languagePreference:language};
  }
  return {action:{type:'reply',text},languagePreference:language};
}

function releaseSuggestions(result){
  if(result?.discovery?.task!=='need_release_scope'||result.catalog_revision!==releaseHints.catalog_revision)return [];
  const question=result.goal_question||'';
  const match=question.match(/^(?:(English|Japanese)\s+)?([\p{L}][\p{L} .'-]{0,59}?)\s+(\d{1,3})\/\d{1,3}[?.!]*$/u);
  if(!match)return [];
  // This is an explicitly labelled alternative interpretation of user input,
  // not a rewritten coordinate, catalog fact, or automatic follow-up call.
  const subject=match[2].trim(),set=match[3];
  const language=match[1]==='English'?'en':match[1]==='Japanese'?'ja':
    result.discovery.languages?.length===1?result.discovery.languages[0]:null;
  const hint=releaseHints.releases.find(r=>r.user_alias===set&&r.language===language);
  if(!hint)return [];
  return [{label:`If ${set} means the set: search ${subject} in ${hint.name} (${LANGUAGES[language]})`,
    question:`${LANGUAGES[language]} ${subject} cards from set ${hint.set_code}`}];
}

module.exports={routeChatText,releaseSuggestions};
