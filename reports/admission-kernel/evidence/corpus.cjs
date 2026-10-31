'use strict';
// Labels are fixed before running admission. clear_supported is the supported
// positive language/query/preference grammar; clear_unsupported is a clear
// request outside that grammar; ambiguous needs clarification by its meaning.
const originals=[
  ['F1_quote','Show Charizard cards; "English" is just an example','language','pr26/raw-language-search.cjs'],
  ['F1_without','Find Charizard cards without using English','language','pr26/raw-language-search.cjs'],
  ['N1_exclude','Show Charizard cards, exclude English','language','claude/repro/admission-counterexamples.cjs'],
  ['N1_other','Charizard cards other than English','language','claude/repro/admission-counterexamples.cjs'],
  ['N1_anything','Show Charizard, anything but English','language','claude/repro/admission-counterexamples.cjs'],
  ['N2_spelled','Find Charizard cards for less than a hundred dollars','commercial','claude/repro/admission-counterexamples.cjs'],
  ['N2_max','Find Charizard cards, max 100 dollars','commercial','claude/repro/admission-counterexamples.cjs'],
  ['N2_bucks','Charizard cards around 100 bucks','commercial','claude/repro/admission-counterexamples.cjs'],
  ['N2_gem','Find gem mint graded Charizard cards','commercial','claude/repro/admission-counterexamples.cjs'],
  ['N2_grade','Find Charizard cards grade 9 or better','commercial','claude/repro/admission-counterexamples.cjs'],
  ['R2_N3_identity','Find English Charizard SV03.5 006/165','identity','pr27/reproduce-admission-bypasses.cjs'],
  ['R1_N3_budget','Find Charizard under USD 100','commercial','pr27/reproduce-admission-bypasses.cjs'],
];
const rows=originals.map(([id,text,kind,source])=>({id,text,kind,source,label:kind==='language'?'clear_unsupported':kind==='commercial'?'clear_unsupported':'clear_supported',mustHold:kind!=='identity',mentionedLanguage:kind==='language'?'en':null,priorLanguage:'ja'}));
// Every literal text from all three reproductions is above; repeated cases are
// represented once, retaining all source references in corpus-provenance.json.
const frames=[
  L=>`Find Charizard cards without using ${L}`,
  L=>`Find Charizard cards without ${L}`,
  L=>`Show Charizard cards, exclude ${L}`,
  L=>`Show Charizard cards excluding ${L}`,
  L=>`Charizard cards other than ${L}`,
  L=>`Show Charizard, anything but ${L}`,
  L=>`Show Charizard cards, skip ${L}`,
  L=>`Show Charizard cards, avoid ${L}`,
  L=>`Show Charizard cards, do not use ${L}`,
  L=>`Show Charizard cards, don't include ${L}`,
  L=>`Show Charizard cards, never ${L}`,
  L=>`Show Charizard cards, no ${L}`,
  L=>`Show Charizard cards, not ${L}`,
  L=>`Show Charizard cards except ${L}`,
  L=>`I do not want ${L} Charizard cards`,
  L=>`I don't prefer ${L} Charizard cards`,
  L=>`Show Charizard cards; "${L}" is just an example`,
  L=>`Show Charizard cards; '${L}' is an example`,
  L=>`Show Charizard cards; “${L}” is a sample`,
  L=>`Show Charizard cards; 「${L}」 is just an example`,
  L=>`Show Charizard cards; the word ${L} is only an example`,
  L=>`Show Charizard cards; ${L} is a word`,
  L=>`Show Charizard cards; ${L} is just an example`,
  L=>`Show Charizard cards; use ${L} as a hypothetical example`,
  L=>`What does ${L} mean?`,
  L=>`What is the meaning of ${L}?`,
  L=>`Define ${L}`,
  L=>`Can you explain the word ${L}?`,
  L=>`Is ${L} a language?`,
  L=>`I am not sure about ${L}`,
  L=>`Should I choose ${L}?`,
  L=>`Could ${L} mean something else?`,
  L=>`${L} is not my choice`,
  L=>`${L} is not wanted`,
  L=>`Not only ${L}; I need to decide`,
  L=>`I saw the label ${L}, what does it mean?`,
  L=>`${L} is not wanted for Charizard`,
  L=>`${L} is just an example for Charizard`,
  L=>`${L} should be excluded from Charizard cards`,
  L=>`${L} is hypothetical for Charizard cards`,
];
for(const [language,name] of [['en','English'],['ja','Japanese']])for(let index=0;index<frames.length;index++)rows.push({id:`frame_${language}_${index+1}`,text:frames[index](name),kind:'language',label:'clear_unsupported',mustHold:true,mentionedLanguage:language,priorLanguage:language==='en'?'ja':'en',source:'generated:40 frames/language'});
const money=[
  'Find Charizard cards, max 100 dollars','Find Charizard cards for less than a hundred dollars','Charizard cards around 100 bucks',
  'Find Charizard cards under 100','Find Charizard cards at most one hundred dollars','Find Charizard cards for 100 yen',
  'Find Charizard under USD 100','Find Charizard for €100','Find Charizard below GBP 100','Find Charizard with a budget of USD 100',
  'budget $100','budget ¥10000','budget ￥10000','budget $USD 100','budget JPY ¥10000',
  'budget a hundred dollars','max 100 dollars','around 100 bucks','under one hundred','no more than fifty yen',
  'Find gem mint graded Charizard cards','Find Charizard cards grade 9 or better','Find Charizard PSA 10','Find BGS 9.5 Charizard cards',
  'Find Charizard CGC 10','Find Charizard graded','I want gem mint','grade 9 or better',
];
money.forEach((text,index)=>rows.push({id:'commercial_'+(index+1),text,kind:'commercial',label:'clear_unsupported',mustHold:true,priorLanguage:'ja',source:'generated:commercial phrasing'}));
const supported=[
  ['Find Pikachu cards','identity',null],
  ['Charizard','identity',null],['Mewtwo','identity',null],['SV03.5','identity',null],['006/165','identity',null],
  ['Lucario','identity',null],['Vaporeon','identity',null],
  ['English Charizard cards','identity','en'],['Japanese Charizard cards','identity','ja'],['Find English Charizard SV03.5 006/165','identity','en'],
  ['English only','language_positive','en'],['English please','language_positive','en'],['Japanese only','language_positive','ja'],['Japanese please','language_positive','ja'],
  ['English, no preference for the rest','language_positive','en'],['Japanese, no preference for the rest','language_positive','ja'],
  ['budget USD 100','preference_positive',null],['budget JPY 10000','preference_positive',null],['PSA 10','preference_positive',null],['BGS 9.5','preference_positive',null],
  ['Have you recommended the cards?','status',null],['Where are my recommendations?','status',null],
];
supported.forEach(([text,kind,language],index)=>rows.push({id:'supported_'+(index+1),text,kind,label:'clear_supported',mustHold:false,expectedLanguage:language,priorLanguage:'ja',source:'generated:positive control'}));
const unsupported=['Order this card now','Pay for this card','What is the weather?','Write me a poem','Buy Charizard at the lowest price','Verify PSA certificate 99900194'];
unsupported.forEach((text,index)=>rows.push({id:'unsupported_'+(index+1),text,kind:'unsupported',label:'clear_unsupported',mustHold:false,priorLanguage:'ja',source:'generated:unsupported control'}));
for(const [index,text] of ['English or Japanese','budget 100','Which grade should I choose?','English and Japanese please'].entries())rows.push({id:'ambiguous_'+(index+1),text,kind:'ambiguous',label:'ambiguous',mustHold:true,priorLanguage:'ja',source:'generated:ambiguous control'});
for(const [index,text] of ['Find Charizard SV03.5 006/165 or SV4 006/165','Find Charizard in SV03.5 and SV4','Find Charizard 006/165 or 183/165'].entries())rows.push({id:'multiple_scope_'+(index+1),text,kind:'multiple_scope',label:'clear_unsupported',mustHold:true,priorLanguage:'ja',source:'generated:multiple identity scope control'});
for(const [index,text] of ['Find Korean Charizard cards','Find French Charizard cards','Find Charizard cards for 100 yuan','Find Charizard cards CHF 100','Find Charizard cards ₹100','Find Charizard cards at most 100','Find Charizard cards with a 100 CAD limit'].entries())rows.push({id:'broad_signal_'+(index+1),text,kind:index<2?'language':'commercial',label:'clear_unsupported',mustHold:true,priorLanguage:'ja',source:'independent review:broad unsupported language and money signals'});
module.exports={rows,originals,frames,intents:['search','reply','refine_language','preferences','status','explain','clarify','unsupported']};
