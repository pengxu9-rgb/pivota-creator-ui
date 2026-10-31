'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {routeChatText,releaseSuggestions}=require('../src/lib/pokemon/chatTextIntent.cjs');
const {latestCatalogMessage}=require('../src/lib/pokemon/mobileAgent.cjs');

test('latest accepted structured language wins over a prior text-language memo',()=>{
  const current={result:{scope_filters:{language:'ja'},goal_question:'English Pikachu cards'}};
  assert.deepEqual(routeChatText('Charizard 151/165',current,{languagePreference:'en'}),{
    action:{type:'ask',question:'Japanese Charizard 151/165'},languagePreference:'ja'});
});
test('negated language is a clarification, never a positive scope change or new backend query',()=>{
  for(const text of ['not English','avoid Japanese','English is not what I want','not English, Japanese please']){
    assert.deepEqual(routeChatText(text,{result:{scope_filters:{language:'en'}}},{languagePreference:'ja'}),{
      action:{type:'language_clarification'},languagePreference:'en'});
  }
});
test('narrow answers remain bound to their current request even when a character is missing',()=>{
  const current={result:{discovery:{task:'need_character_or_coordinates'}}};
  for(const text of ['yes','151/165','holo'])assert.equal(routeChatText(text,current).action.type,'reply');
});
test('a missing release offers a labelled alternative only; literal coordinate and source request stay intact',()=>{
  const result={catalog_revision:require('../src/lib/pokemon/chatReleaseHints.json').catalog_revision,goal_question:'English Charizard 151/165',discovery:{task:'need_release_scope'}};
  const before=structuredClone(result),choices=releaseSuggestions(result);
  assert.deepEqual(result,before);
  assert.deepEqual(choices,[{label:'If 151 means the set: search Charizard in Pokémon 151 (English)',question:'English Charizard cards from set SV03.5'}]);
  assert.deepEqual(routeChatText(choices[0].question,{result}).action,{type:'ask',question:choices[0].question});
  assert.deepEqual(releaseSuggestions({...result,discovery:{task:'exact_coordinates',status:'no_match'}}),[]);
  assert.deepEqual(releaseSuggestions({...result,goal_question:'English <script> 151/165'}),[]);
  for(const fraction of ['006/165','001/032'])assert.deepEqual(releaseSuggestions({...result,goal_question:'English Charizard '+fraction}),[]);
  assert.deepEqual(releaseSuggestions({...result,catalog_revision:'f'.repeat(64)}),[],'stale release hints cannot apply to another catalog');
});
test('a pending negative language correction cannot inherit the old language on the next query',()=>{
  const current={result:{scope_filters:{language:'en'}}},state={languagePreference:'en',languageClarificationPending:true};
  assert.equal(routeChatText('Charizard 151/165',current,state).action.type,'language_clarification');
  assert.equal(routeChatText("What does 'English' mean?",current,state).action.type,'language_clarification');
  assert.deepEqual(routeChatText('Japanese',current,state).action,{type:'refine',scope:{language:'ja'}});
  assert.deepEqual(routeChatText('Japanese Charizard 151/165',current,state).action,{type:'ask',question:'Japanese Charizard 151/165'});
  assert.deepEqual(routeChatText('Japanese Charizard cards',current,state).action,{type:'ask',question:'Japanese Charizard cards'});
});
test('status-only messages preserve current card controls; a real clarification still replaces the current catalog message',()=>{
  const cardMessage={id:'cards',role:'assistant',status:'accepted',cards:[{card_id:'en:SV03.5:006/165:holo'}],selectionAllowed:true};
  const status={id:'status',role:'assistant',status:'accepted',cards:[],selectionAllowed:false,catalogStatusOnly:true};
  assert.equal(latestCatalogMessage([cardMessage,status]),cardMessage);
  const clarification={id:'clarify',role:'assistant',status:'accepted',cards:[],selectionAllowed:false};
  assert.equal(latestCatalogMessage([cardMessage,status,clarification]),clarification);
});
