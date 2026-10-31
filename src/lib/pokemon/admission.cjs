'use strict';

// The only authority constructor in the Pot pilot. Routers and models return
// candidates; neither a structurally identical object nor a copied symbol is a
// capability. WeakMap membership and a frozen scope bind each invocation.
const {CollectorCallError}=require('./collectorError.cjs');
const vocabulary=require('./admissionVocabulary.json');
const plans=new WeakMap();
const fail=code=>{throw new CollectorCallError(code);};
const copy=structuredClone;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const LANG={en:'English',ja:'Japanese'};
const CURRENCIES=['USD','JPY','HKD','EUR','GBP','CNY','KRW'];
const COMPANIES=['PSA','BGS','CGC','ARS','PGC'];
const BINDING=['owner','chatId','stateVersion','workspaceId','workspaceVersion','deadline'];
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
const languageCode=value=>/^(?:English|en|英語|英文|英版)$/i.test(value)?'en':/^(?:Japanese|jp|日本語|日文|日版)$/i.test(value)?'ja':null;
const LANGUAGE_SOURCE='English|Japanese|\\b(?:en|jp|French|Korean|Chinese|German|Spanish|Italian|Portuguese|Dutch|Polish|Russian|Swedish|Norwegian|Finnish|Danish|Arabic|Hebrew|Greek|Turkish|Hindi|Vietnamese|Thai|Indonesian|Malay|Czech|Hungarian|Traditional Chinese|Simplified Chinese|français|deutsch|español)\\b|英語|英文|英版|日本語|日文|日版|日英|中文|汉语|漢語|简体|簡體|繁體|繁体|韩语|韓語|한국어|法文|法語|德文|德語|西班牙語|西班牙文|意大利語|葡萄牙語';
const languageSignals=text=>[...text.matchAll(new RegExp(LANGUAGE_SOURCE,'ig'))].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length,language:languageCode(m[0])}));
const MONEY=/[$¥￥€£₩]|\b(?:USD|JPY|HKD|EUR|GBP|CNY|KRW)(?=\b|\d)|\b(?:dollars?|bucks?|yen|euros?|pounds?|won|budget|max(?:imum)?|under|below|less\s+than|up\s+to|hundred|thousand|million|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b|\b(?:for|around|about)\s+(?:(?:a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b)|预算|預算|上限|不超过|不超過/i;
// Detection is deliberately broader than the seven currencies the positive
// compiler supports. ICU's offline currency vocabulary requires no provider.
const CURRENCY_CODES=Intl.supportedValuesOf('currency').join('|')+'|RMB|NTD';
const CURRENCY_SIGNAL=new RegExp('\\b(?:'+CURRENCY_CODES+')(?=\\b|\\d)');
const CURRENCY_AMOUNT_SIGNAL=new RegExp('(?:\\b(?:'+CURRENCY_CODES+')\\s*\\d|\\d\\s*(?:'+CURRENCY_CODES+')\\b)','i');
const MONEY_WORD=/\b(?:yuan|renminbi|rupees?|francs?|pesos?|reais|real|baht|rubles?|roubles?|zloty|krona|kronor|krone|kroner|dirhams?|riyals?|dinar|ringgit|rupiah|dong|shekels?|lira|rands?|pence|cents?)\b|\bat\s+most\b|\b(?:for|around|about)\s+\d|\d\s*(?:limit|cap)\b|\d\s*(?:元|円|圓|块|塊|港币|港幣|人民幣|人民币)/i;
const GRADE=/\b(?:PSA|BGS|CGC|ARS|PGC|grad(?:e|ed|ing))(?=\b|\d)|\bgem[\s-]*mint\b/i;
const SEARCH=/\b(?:find|show|search|recommend|suggest|inspect|compare|look|list|browse|switch)\b/i;
const FRACTION=/\b\d{1,3}\/[a-z0-9-]{1,32}\b/ig;
const SET=/\b(?:[A-Z]{1,8}[0-9][A-Z0-9.-]{0,31}|(?:SV|SM|S|XY)-P)\b/ig;
const CARD_ID=/^(?:en|ja):[^:\s/\\?#]{1,80}:[A-Za-z0-9/._-]{1,80}:[^:\s/\\?#]{1,80}$/;
// This small lexicon is a completeness detector, not a catalog identity map.
// Other names still reach native discovery through an explicit search request.
const SUBJECT=/\b(?:charizard|pikachu|mew(?:two)?|eevee|bulbasaur|squirtle|charmander|umbreon|gengar|lugia|rayquaza|snorlax|greninja|dragonite|blastoise|venusaur)\b|喷火龙|噴火龍|皮卡丘|リザードン|ピカチュウ/i;
const POSITIVE_SUBJECT='(?:Charizard|Pikachu|Mewtwo|Mew|Eevee|Bulbasaur|Squirtle|Charmander|Umbreon|Gengar|Lugia|Rayquaza|Snorlax|Greninja|Dragonite|Blastoise|Venusaur|喷火龙|噴火龍|皮卡丘|リザードン|ピカチュウ)';
const POSITIVE_QUERY=new RegExp('^\\s+(?:'+POSITIVE_SUBJECT+'(?:\\s+(?:ex|VMAX|VSTAR|V|GX|EX))?(?:\\s+cards?)?(?:\\s+(?:from|in)\\s+(?:the\\s+)?set\\s+[A-Za-z0-9.-]{1,32})?(?:\\s+[A-Z]{1,6}[0-9][A-Za-z0-9.-]{0,30})?(?:\\s+\\d{1,3}/[a-z0-9-]{1,32})?|cards?\\s+from\\s+(?:the\\s+)?set\\s+[A-Za-z0-9.-]{1,32})(?:\\s+(?:only|please))?[?!.。]*\\s*$','i');
const NARROW_REPLY=/^(?:yes|confirm|yes, that one|holo|normal|reverse holo|reverse|はい|确认|是|\d{1,3}\/[a-z0-9-]{1,32})[.!。]?$/i;
const STATUS=/^(?:status|(?:(?:have|did) you (?:already )?(?:recommend|recommended|suggest|suggested)(?: the| any)? cards)|(?:(?:where|what) are (?:my|the|your) (?:recommendations|cards))|(?:show (?:me )?(?:my|the|your) recommendations)|recommend cards)[?!.\/,;:]*$/i;
const EXPLANATION=/^(?:explain|(?:explain|what (?:is|are)|why (?:is|are)|how (?:does|do))\s+(?:the\s+)?(?:current results|catalog identity|identity ambiguity|PSA grading|grading|grade and budget|budget fit|live prices|provider access|capabilities|this agent|your scope))(?:\s+(?:mean|work|unavailable|disabled))?[?!.]*$/i;
const UNSUPPORTED=/^(?:hi|hello|hey|thanks|thank you|tell me a joke|what(?:'s| is) the weather(?: today)?|who are you|what can you do)[?!.]*$/i;

const normalize=text=>text.normalize('NFKC');
const fold=text=>Array.from(text).map(c=>vocabulary.casefoldOverrides[c]??c.toLowerCase()).join('');
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const releaseEntries=[...vocabulary.releases].sort((a,b)=>b.alias.length-a.alias.length||a.alias.localeCompare(b.alias));
// Python's native \s also includes NEL and the information separators. Its
// generated character class prevents a JS-regex detection gap after NFKC.
const nativePattern=pattern=>pattern.replaceAll('\\s',vocabulary.native_whitespace_regex);
const finishRules=vocabulary.finish_rules.map(rule=>({...rule,regex:new RegExp(nativePattern(rule.pattern),'gu')}));
function mentions(text){
  const value=fold(text),releases=[],finishes=[];
  for(const entry of releaseEntries){
    let start=value.indexOf(entry.alias);
    while(start!==-1){
      const end=start+entry.alias.length,ascii=/^[a-z0-9 '\-.]+$/.test(entry.alias);
      const code=entry.sources.every(source=>/code/.test(source));
      if((!ascii||!/[a-z0-9]/.test(value[start-1]||'')&&!(code?/^(?:[a-z0-9]|[.\-][a-z0-9])/:/^[a-z0-9]/).test(value.slice(end,end+2)))&&
        !releases.some(hit=>start>=hit.start&&end<=hit.end))releases.push({...entry,start,end});
      start=value.indexOf(entry.alias,start+1);
    }
  }
  for(const rule of finishRules)for(const match of value.matchAll(rule.regex)){
    const start=match.index,end=start+match[0].length;
    // A finish token inside a release title is consumed only by that title.
    if(!releases.some(hit=>start>=hit.start&&end<=hit.end))finishes.push({...rule,alias:match[0],start,end});
  }
  const longest=finishes.filter(hit=>!finishes.some(other=>other!==hit&&other.start<=hit.start&&other.end>=hit.end&&other.end-other.start>hit.end-hit.start));
  return {releases,finishes:longest.filter((hit,index,all)=>all.findIndex(other=>other.start===hit.start&&other.end===hit.end&&other.variant===hit.variant)===index)};
}
function catalogSyntax(text,signals,language,current,{explicitLegacySubject=false}={}){
  let value=fold(text).trim().replace(/[?!.。]+$/u,'').trim(),scope={},usedReleases=[];
  const field=current?.result?.next_step?.field||current?.next_step?.field;
  const targets=entry=>[...new Set(entry.targets.filter(t=>!language||t.language===language).map(t=>t.set_code))];
  const bareRelease=signals.releases.find(hit=>hit.start===0&&hit.end===value.length);
  if(bareRelease&&/^(?:release|set_code)$/.test(field||'')&&targets(bareRelease).length===1)
    return {scope:{set_code:targets(bareRelease)[0]},reply:true};
  const bareFinish=signals.finishes.find(hit=>hit.start===0&&hit.end===value.length&&hit.kind==='exact');
  if(bareFinish&&/^(?:variant|finish)$/.test(field||''))return {scope:{variant:bareFinish.variant},reply:true};
  // Round 3 uses a whole-text positive grammar for every ask/reply. The
  // former negation-list check was redundant: unconsumed words always hold.
  // The whole release phrase is positive syntax. A vocabulary occurrence by
  // itself (or in a quotation/example/question) grants no filter authority.
  for(const hit of signals.releases){
    const suffix=new RegExp('\\s+(?:(?:only|exclusively|strictly)\\s+)?from\\s+(?:(?:the\\s+)?set\\s+)?'+escape(hit.alias)+'(?:\\s+(?:only|please))?$','u');
    const match=value.match(suffix);
    if(match){const codes=targets(hit);if(codes.length!==1)return null;scope.set_code=codes[0];usedReleases.push(hit);value=value.slice(0,match.index);break;}
  }
  const finish=signals.finishes.filter(hit=>hit.end<=value.length);
  if(finish.length){
    if(finish.length!==1||finish[0].kind!=='exact')return null;
    const hit=finish[0];
    if(!/^\s+cards?(?:\s+(?:only|please))?$/.test(value.slice(hit.end))||!value.slice(0,hit.start).endsWith(' '))return null;
    scope.variant=hit.variant;value=value.slice(0,hit.start)+value.slice(hit.end).trimStart();
  }
  value=value.replace(/^(?:english|japanese|en|jp|英語|英文|英版|日本語|日文|日版)\s+/u,'');
  value=value.replace(/^(?:(?:please\s+)?(?:find|show|search(?:\s+for)?|recommend|suggest|inspect|compare|list|browse|look\s+(?:for|at))\s+(?:me\s+)?)/u,'');
  value=value.replace(/^(?:english|japanese|en|jp|英語|英文|英版|日本語|日文|日版)\s+/u,'');
  // This exact generic discovery seed was already accepted by the original
  // screenshot regression. It admits no character, artist or title modifier.
  // Preserve the existing round-2 explicit search control without admitting a
  // bare unknown name or widening the language-answer grammar. This complete
  // literal has no free identity/modifier span for native to reinterpret.
  const legacySubject=explicitLegacySubject&&value==='lucario cards';
  if(!POSITIVE_QUERY.test(' '+value)&&value!=='a valuable card'&&!legacySubject)return null;
  const printed=value.match(/\b(?:from|in)\s+(?:the\s+)?set\s+([^\s]+)/u);
  if(printed&&!new RegExp('^(?:'+SET.source+')$','i').test(printed[1])&&
    !signals.releases.some(hit=>hit.alias===printed[1]))return null;
  // Printed codes and fractions retain their own identity spans. In
  // particular, a numeric release title inside 151/165 is not a release claim.
  for(const hit of signals.releases){
    if(usedReleases.includes(hit))continue;
    const inFraction=signals.fractions.some(f=>fold(f).includes(hit.alias)&&value.includes(fold(f)));
    const printed=signals.sets.some(code=>fold(code)===hit.alias);
    if(inFraction)continue;
    if(!printed||!new RegExp('(?:^|\\s)'+escape(hit.alias)+'(?:\\s|$)').test(value))return null;
    const codes=targets(hit);if(codes.length!==1||scope.set_code&&scope.set_code!==codes[0])return null;
    scope.set_code=codes[0];
  }
  const subject=value.match(new RegExp('^('+POSITIVE_SUBJECT+')(?:\\s+(ex|vmax|vstar|v|gx))?(?=\\s|$)','i'));
  const names=POSITIVE_SUBJECT.slice(3,-1).split('|');
  let canonical=subject?names.find(name=>fold(name)===fold(subject[1])):legacySubject?'Lucario':null;
  if(['喷火龙','噴火龍','リザードン'].includes(canonical))canonical='Charizard';
  if(['皮卡丘','ピカチュウ'].includes(canonical))canonical='Pikachu';
  return {scope,reply:false,identity:{subject:canonical||null,form:subject?.[2]?.toLowerCase()||null}};
}
function bareNumber(text){
  // Only actual coordinates and printed codes consume numeric identity spans;
  // an arbitrary `ja:` prefix must not hide a new amount from this detector.
  const residual=text.replace(FRACTION,' ').replace(SET,' ');
  // A residual decimal sequence is commercial even when a word is attached
  // (50ish, 50ドル, 50美元). Only real identity spans consume its digits.
  return /\p{Nd}+/u.test(residual);
}

const R3_CJK_COMPARISON=/以下で?|以内|まで|未満|不超过|不超過/u;
const R3_ENGLISH_COMPARISON=/\b(?:over|not\s+over|no\s+more\s+than|capped|cap|at\s+most|max)\b/iu;
const R3_EXTENDED_SYMBOL=/≦|＜/u;
const R3_GRADE_WORDING=/\b(?:slabbed|unslabbed|tens|nines|NM)\b|\bPSA\s*\p{Nd}+s\b/iu;
const CJK_NUMERALS='[〇零一二三四五六七八九十百千万萬億亿兆两兩壹贰貳叁參叄肆伍陆陸柒捌玖拾佰仟廿卅卌]+';
const CJK_UNIT='(?:ドル|美元|美金|円|元|圓|块|塊|usd|bucks?|dollars?|k|以下で?|以内|まで|未満|不超过|不超過|over|capped|cap|at most|max)';
const R3_CJK_AMOUNT=new RegExp('(?:'+CJK_NUMERALS+vocabulary.native_whitespace_regex+'*'+CJK_UNIT+'|'+CJK_UNIT+vocabulary.native_whitespace_regex+'*'+CJK_NUMERALS+')','iu');

function extractSignals(text){
  const fractions=[...text.matchAll(FRACTION)].map(m=>m[0]);
  const sets=[...text.matchAll(SET)].map(m=>m[0]);
  const parsed=mentions(text);
  return {languages:languageSignals(text),money:MONEY.test(text)||/\p{Sc}/u.test(text)||CURRENCY_SIGNAL.test(text)||CURRENCY_AMOUNT_SIGNAL.test(text)||MONEY_WORD.test(text)||bareNumber(text)||/≤|<|\b(?:or less|or under|tops|within|cheaper)\b/i.test(text)||R3_CJK_COMPARISON.test(text)||R3_ENGLISH_COMPARISON.test(text)||R3_EXTENDED_SYMBOL.test(text)||R3_CJK_AMOUNT.test(text),grade:GRADE.test(text)||/\b(?:slabs?|raw|ungraded|mint)\b/i.test(text)||R3_GRADE_WORDING.test(text),fractions,sets,...parsed,
    search:SEARCH.test(text),identity:fractions.length>0||sets.length>0||parsed.releases.length>0||parsed.finishes.length>0||SUBJECT.test(text)||/\bcatalog record\b|\bcards?\s+(?:from|in)\s+(?:the\s+)?set\b/i.test(text)};
}
function rememberedLanguage(doc,current){
  const languages=current?.result?.discovery?.languages;
  return LANG[current?.result?.scope_filters?.language]?current.result.scope_filters.language:
    Array.isArray(languages)&&languages.length===1&&LANG[languages[0]]?languages[0]:LANG[doc?.languagePreference]?doc.languagePreference:null;
}
// Positive language has three supported syntactic positions. Every other
// occurrence (including negation, quotations and questions about the word) is
// held, rather than guessed from an ever-growing list of negative phrases.
function acceptedLanguage(text,signals){
  if(!signals.length)return {language:null,text};
  if(signals.length!==1||!signals[0].language)return null;
  const token=signals[0],head=text.slice(0,token.start),tail=text.slice(token.end);
  const answerHead=/^\s*$/u.test(head);
  const answerTail=/^\s*(?:[,;.]?\s*(?:only|please|no preference(?:s)?(?:\s+(?:on|for))?\s+(?:(?:the\s+)?(?:others?|rest)|anything else)|(?:the\s+)?(?:others?|rest)\s+(?:do not|don't) matter))*[.!。]*\s*$/i.test(tail);
  if(answerHead&&answerTail)return {language:token.language,text:'',answer:true};
  const prefix=/^\s*(?:(?:please\s+)?(?:find|show|search(?:\s+for)?|recommend|suggest|inspect|compare|list|browse|look\s+(?:for|at))\s+(?:me\s+)?)?$/i.test(head);
  const positiveRemainder=POSITIVE_QUERY.test(tail)||!!catalogSyntax(tail.trim(),extractSignals(tail.trim()),token.language,null);
  if(prefix&&positiveRemainder)return {language:token.language,text:(head+tail).trim()};
  const suffix=/\s+in\s+$/i.test(head)&&/^\s*(?:only|please)?[.!?。]*\s*$/i.test(tail);
  if(suffix){const body=head.replace(/\s+in\s+$/i,'').trim(),subject=body.replace(/^(?:(?:please\s+)?(?:find|show|search(?:\s+for)?|recommend|suggest|inspect|list|browse|look\s+(?:for|at))\s+(?:me\s+)?)/i,'');if(POSITIVE_QUERY.test(' '+subject)||catalogSyntax(body,extractSignals(body),token.language,null))return {language:token.language,text:body};}
  return null;
}
function validPreferences(p,current){
  const allowed=['grade_company','grade_value','budget_minor','currency','destination','collecting'];
  if(!p||typeof p!=='object'||Array.isArray(p)||!Object.keys(p).length||Object.keys(p).some(k=>!allowed.includes(k)))fail('invalid_action');
  if(Object.hasOwn(p,'budget_minor')&&(!Number.isSafeInteger(p.budget_minor)||p.budget_minor<1||p.budget_minor>1e12))fail('invalid_action');
  if(Object.hasOwn(p,'currency')&&!CURRENCIES.includes(p.currency))fail('invalid_action');
  if(Object.hasOwn(p,'grade_company')&&!COMPANIES.includes(p.grade_company))fail('invalid_action');
  if(Object.hasOwn(p,'grade_value')&&(typeof p.grade_value!=='string'||!/^\d{1,2}(?:\.5)?$/.test(p.grade_value)||Number(p.grade_value)<1||Number(p.grade_value)>10))fail('invalid_action');
  if(p.budget_minor!==undefined&&!CURRENCIES.includes(p.currency||current?.result?.preferences?.currency))fail('invalid_action');
  if(p.currency&&p.budget_minor===undefined&&current?.result?.preferences?.budget_minor!==undefined&&current.result.preferences.currency!==p.currency)fail('invalid_action');
  if(p.destination!==undefined&&p.destination!==null&&(typeof p.destination!=='string'||p.destination.length>80||!p.destination.trim()))fail('invalid_action');
  if(p.collecting!==undefined&&p.collecting!==null){
    const c=p.collecting,keys=['mode','preferred_dex_ids','excluded_dex_ids','preferred_illustrators','preferred_releases','subjective_notes'];
    if(typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!keys.includes(k)))fail('invalid_action');
    for(const [k,v] of Object.entries(c)){
      if(v===null)continue;
      if(k==='mode'){if(!['discover_next','explore'].includes(v))fail('invalid_action');continue;}
      if(!Array.isArray(v)||v.length>(k.endsWith('dex_ids')?20:10))fail('invalid_action');
      if(k.endsWith('dex_ids')){if(v.some(n=>!Number.isInteger(n)||n<1||n>1025))fail('invalid_action');}
      else if(k==='preferred_releases'){if(v.some(r=>!exact(r,['language','set_code'])||!LANG[r.language]||typeof r.set_code!=='string'||!/^[A-Za-z0-9.-]{1,32}$/.test(r.set_code)))fail('invalid_action');}
      else if(v.some(s=>typeof s!=='string'||!s.trim()||s.length>160))fail('invalid_action');
      if(new Set(v.map(s=>JSON.stringify(s))).size!==v.length)fail('invalid_action');
    }
    if((c.preferred_dex_ids||[]).some(n=>(c.excluded_dex_ids||[]).includes(n)))fail('invalid_action');
  }
  return copy(p);
}
function typedAction(a,current){
  const fields={ask:['type','question'],reply:['type','text'],preferences:['type','preferences'],refine:['type','scope'],
    select:['type','card_id'],compare:['type','left_card_id','right_card_id'],choose_comparison:['type','side','card_id'],
    page:['type','offset'],feedback:['type','card_id','reaction'],clear_target:['type'],inventory:['type','owned_items'],resolve_owned:['type','item_id','card_id']};
  if(!fields[a?.type]||!exact(a,fields[a.type]))fail('invalid_action');
  if(['ask','reply'].includes(a.type)){const t=a.type==='ask'?a.question:a.text;if(typeof t!=='string'||!t.trim()||t.length>2000)fail('invalid_action');}
  if(a.type==='preferences')validPreferences(a.preferences,current);
  if(a.type==='refine'){
    if(!a.scope||typeof a.scope!=='object'||Array.isArray(a.scope)||!Object.keys(a.scope).length||Object.keys(a.scope).some(k=>!['language','set_code','collector_number','variant'].includes(k)))fail('invalid_action');
    for(const [k,v] of Object.entries(a.scope))if(k==='language'?!LANG[v]:typeof v!=='string'||!v.trim()||v.length>80||!(/^[A-Za-z0-9./ _-]+$/).test(v))fail('invalid_action');
  }
  for(const k of ['card_id','left_card_id','right_card_id'])if(Object.hasOwn(a,k)&&(typeof a[k]!=='string'||!a[k].trim()||a[k].length>160))fail('invalid_action');
  if(a.type==='compare'&&a.left_card_id===a.right_card_id)fail('invalid_action');
  if(a.type==='choose_comparison'&&!['left','right'].includes(a.side))fail('invalid_action');
  if(a.type==='feedback'&&!['like','dismiss','clear'].includes(a.reaction))fail('invalid_action');
  if(a.type==='page'&&(!Number.isInteger(a.offset)||a.offset<0||a.offset>100000))fail('invalid_action');
  if(a.type==='inventory'&&(!Array.isArray(a.owned_items)||a.owned_items.length>100))fail('invalid_action');
  if(a.type==='resolve_owned'&&(typeof a.item_id!=='string'||!a.item_id.trim()||a.item_id.length>160))fail('invalid_action');
  const cards=currentCards(current);
  // RULE:card_binding
  if(['select','choose_comparison','feedback'].includes(a.type)&&!cards.has(a.card_id))fail('catalog_rejected_action');
  return copy(a);
}
function currentCards(current){
  const r=current?.result;
  const comparison=r?.discovery?.comparison;
  const collect=value=>Array.isArray(value)?value.flatMap(collect):value&&typeof value==='object'?[...(typeof value.card_id==='string'?[value.card_id]:[]),...Object.values(value).filter(v=>v&&typeof v==='object').flatMap(collect)]:[];
  return new Set([...(r?.candidate_cards||[]).map(c=>c.card_id),r?.selected_catalog_target?.card_id,
    ...(current?.needs_reconfirmation===true?[]:[current?.saved_decision?.card_id]),...collect(comparison)].filter(Boolean));
}
function preferenceFromText(text,current){
  // Bounded positive grammar: explicit ISO currencies, plus unambiguous euro,
  // pound and won symbols. Dollar/yen symbols are always a clarification.
  if(/[$¥￥]/.test(text))return null;
  let rest=text.trim(),patch={};
  const grade=rest.match(/\b(PSA|BGS|CGC|ARS|PGC)\s*(\d{1,2}(?:\.5)?)\b/i);
  if(grade){patch.grade_company=grade[1].toUpperCase();patch.grade_value=grade[2];rest=rest.replace(grade[0],' ');}
  const money=rest.match(/\b(?:budget|under|below|up to|less than|max(?:imum)?)\s*(?:(?:is|of|to|at)\s*)?[:=]?\s*(?:(USD|JPY|HKD|EUR|GBP|CNY|KRW)|([€£₩]))\s*(\d{1,10}(?:,\d{3})*(?:\.\d{1,2})?)(?![\d./])/i);
  if(money){
    const currency=(money[1]||({'€':'EUR','£':'GBP','₩':'KRW'}[money[2]])).toUpperCase(),scale=['JPY','KRW'].includes(currency)?0:2;
    if(money[2]&&current?.result?.preferences?.currency!==currency)return null;
    const parts=money[3].replaceAll(',','').split('.');if((parts[1]||'').length>scale)return null;
    patch.currency=currency;patch.budget_minor=Number(parts[0])*10**scale+Number((parts[1]||'').padEnd(scale,'0'));rest=rest.replace(money[0],' ');
  }
  const currency=rest.match(/^(?:use|currency(?: is)?|set currency to)\s+(USD|JPY|HKD|EUR|GBP|CNY|KRW)[.!]?$/i);
  if(currency){patch.currency=currency[1].toUpperCase();rest='';}
  rest=rest.replace(/\b(?:my|the|a|an|i|want|prefer|please|use|set|update|change|to|and|with|grade|grading|currency|budget|is|of|at|only)\b/gi,'').replace(/[\s,.;:!]/g,'');
  if(rest||!Object.keys(patch).length)return null;
  try{return validPreferences(patch,current);}catch{return null;}
}
function scopeFor(action,text,language,current){
  const previous=current?.result?.scope_filters||{};
  const scope=action.type==='ask'?{}:Object.fromEntries(['language','set_code','collector_number','variant'].filter(k=>Object.hasOwn(previous,k)).map(k=>[k,copy(previous[k])]));
  if(language)scope.language=language;
  if(action.type==='refine')Object.assign(scope,action.scope);
  if(action.type==='ask'){
    const s=extractSignals(text);
    if(s.sets.length===1)scope.set_code=s.sets[0];
    else {const set=text.match(/\bset\s+([A-Za-z0-9.-]{1,32})\b/i);if(set)scope.set_code=set[1];}
    if(s.fractions.length===1)scope.collector_number=s.fractions[0];
  }
  if(action.type==='reply'){
    const field=current?.result?.next_step?.field||current?.next_step?.field;
    if(/^(?:number|collector_number|coordinates)$/.test(field||'')&&/^\d{1,3}\/[a-z0-9-]{1,32}[.!。]?$/i.test(text))scope.collector_number=text.replace(/[.!。]$/,'');
    if(/^(?:release|set_code)$/.test(field||'')&&extractSignals(text).sets.length===1)scope.set_code=text.replace(/[.!。]$/,'');
  }
  return scope;
}
function makePlan(value){const plan=freeze(copy(value));plans.set(plan,{used:false});return plan;}
function serverRecordQuestion(question){
  const id=CARD_ID.source.slice(1,-1);
  // Only the exact questions emitted by the two server record paths qualify.
  const inspect=question.match(new RegExp('^Inspect catalog record ('+id+')$'));
  if(inspect&&inspect[0]===question)return true;
  const pair=question.match(new RegExp('^Compare ('+id+') and ('+id+')$'));
  return !!pair&&pair[0]===question&&pair[1]!==pair[2];
}
function storedQuestionAccepted(question){
  if(typeof question!=='string'||!question.trim()||question.length>2000)return false;
  // RULE:stored_server_record_exception
  if(serverRecordQuestion(question))return true;
  const previous=normalize(question);
  // Replay may not accept a question that fresh typed admission would reject
  // after normalization or boundary trimming, on either grammar path.
  if(previous!==previous.trim()||previous.length>2000)return false;
  const signals=extractSignals(previous),positive=acceptedLanguage(previous,signals.languages);
  const explicitLegacySubject=/^(?:(?:English|Japanese)\s+)?find lucario cards[?!.]*$/i.test(previous);
  if(signals.money||signals.grade||signals.sets.length>1||signals.fractions.length>1||signals.languages.length&&!positive&&!explicitLegacySubject)return false;
  // RULE:stored_ask_own_language
  // A later refine changes the workspace language, not this stored ask. The
  // exact legacy literal has its own leading prefix; otherwise only an
  // accepted positive language position supplies a language. No fallback.
  const language=positive?.language||(explicitLegacySubject?languageCode(previous.match(/^(English|Japanese)\s+/i)?.[1]||''):null);
  let accepted=catalogSyntax(previous,signals,language,null,
    {explicitLegacySubject});
  // Match ask-time forwarding for accepted language positions such as a bare
  // trailing "in English". Release/finish prose must still pass the original
  // raw syntax check, exactly as native_constraint_complete requires on asks.
  if(!accepted&&positive&&!positive.answer&&!signals.releases.length&&!signals.finishes.length){
    const forwarded=(language?LANG[language]+' ':'')+positive.text;
    if(forwarded.length<=2000)accepted=catalogSyntax(forwarded,extractSignals(forwarded),language,null);
  }
  return !!accepted&&(!accepted.identity?.form||accepted.identity.form==='ex')||positive?.answer===true;
}
function storedReplyAccepted(text){
  if(typeof text!=='string'||!text.trim()||text.length>2000)return false;
  const raw=normalize(text).trim(),folded=fold(raw),value=folded.replace(/[.!。]$/u,'');
  // Exact vocabulary membership consumes the complete reply, including bare
  // numeric release aliases. A contained word never authorizes extra prose.
  if(vocabulary.releases.some(entry=>entry.alias===folded||entry.alias===value)||vocabulary.finishes.some(entry=>entry.kind==='exact'&&(entry.alias===folded||entry.alias===value)))return true;
  const signals=extractSignals(raw);
  if(signals.money||signals.grade)return false;
  // No historical prompt is available. These are field-independent narrow
  // forms only; new live replies still require their original prompt binding.
  // RULE:stored_reply_narrow_forms
  return /^(?:yes|confirm|yes, that one|はい|确认|是)$/u.test(value)||
    /^\d{1,3}\/[a-z0-9-]{1,32}$/u.test(value)||new RegExp('^(?:'+SET.source+')$','i').test(value)||
    acceptedLanguage(raw,signals.languages)?.answer===true;
}
function storedGoalsAccepted(current){
  const question=current?.result?.goal_question;
  // A missing goal is normal for a fresh/withdrawn workspace; a malformed or
  // unsupported stored question must never acquire replay authority.
  // RULE:stored_goal_positive
  if(question!==undefined&&question!==null&&!storedQuestionAccepted(question))return false;
  // Public workspace views omit the session. The private workspace calls this
  // same validator on its locked authoritative record, before replay or writes.
  const session=current?.session;
  if(session&&Object.hasOwn(session,'turns')){
    // RULE:stored_ask_history_positive
    if(!Array.isArray(session.turns)||session.turns.some(turn=>turn?.type==='ask'&&!storedQuestionAccepted(turn.question)))return false;
    // RULE:stored_reply_history_positive
    if(session.turns.some(turn=>turn?.type==='reply'&&!storedReplyAccepted(turn.text)))return false;
  }
  return true;
}
function validatePlan(plan,binding,{consume=false,now=Date.now}={}){
  const meta=plan&&typeof plan==='object'?plans.get(plan):null;
  // RULE:brand
  if(!meta)fail('catalog_admission_required');
  // RULE:scope_binding
  if(!binding||BINDING.some(k=>binding[k]!==plan.binding[k]))fail('catalog_admission_scope_mismatch');
  const time=typeof now==='function'?now():now;
  // RULE:deadline
  if(!Number.isFinite(time)||time>=plan.binding.deadline)fail('catalog_admission_expired');
  if(consume){if(meta.used)fail('catalog_admission_consumed');meta.used=true;}
  return plan;
}
function admit({candidate,text='',ingress='text',binding,current=null,doc={},now=Date.now}={}){
  // One canonical string enters every detector/grammar and is forwarded to
  // native. The parser must never see a compatibility form the kernel missed.
  text=typeof text==='string'?normalize(text):text;
  const time=typeof now==='function'?now():now;
  if(!exact(binding,BINDING)||typeof binding.owner!=='string'||!binding.owner||typeof binding.chatId!=='string'||!binding.chatId||!Number.isInteger(binding.stateVersion)||binding.stateVersion<0||!Number.isFinite(binding.deadline)||binding.deadline<=time||
    (binding.workspaceId===null)!==(binding.workspaceVersion===null)||binding.workspaceId!==null&&(typeof binding.workspaceId!=='string'||!Number.isInteger(binding.workspaceVersion)||binding.workspaceVersion<0))fail('catalog_admission_scope_mismatch');
  let action=copy(candidate?.action||{}),language=rememberedLanguage(doc,current),hold=null,lexicalScope={},identity=null;
  if(typeof action.question==='string')action.question=normalize(action.question);
  if(typeof action.text==='string')action.text=normalize(action.text);
  const local=(field,code)=>{hold={field,reason:'uncertain',...(code?{code}:{})};action=field==='language'?{type:'language_clarification'}:{type:'model_clarification',field,reason:'uncertain',...(code?{code}:{})};};
  if(ingress==='commerce'){
    // RULE:commerce_hold
    if(doc.languageClarificationPending||doc.modelClarificationPending||doc.pending||doc.admissionFailure)fail('catalog_rejected_action');
    const request=candidate?.request,op=candidate?.operation;
    if(!['research','select','handoff','psa'].includes(op))fail('invalid_commerce_request');
    const admittedCards=currentCards(current);
    const subject=doc.commerceAnchor?.card_id||current?.saved_decision?.card_id||current?.result?.target_intent?.card_id;
    // RULE:commerce_subject
    if(['research','select'].includes(op)&&(!admittedCards.has(request?.card_id)||subject&&subject!==request.card_id))fail('catalog_rejected_action');
    return makePlan({kind:'commerce',action:null,operation:op,request:copy(request),binding,languagePreference:language,constraints:{language,scope:{},preferences:{}},localOnly:false,hold:null});
  }
  if(!['text','typed','server'].includes(ingress))fail('invalid_action');
  if(ingress==='server'){
    if(action.type==='inspect_record'&&exact(action,['type','card_id'])&&CARD_ID.test(action.card_id))action={type:'ask',question:'Inspect catalog record '+action.card_id};
    else if(action.type==='compare_records'&&exact(action,['type','left_card_id','right_card_id'])&&CARD_ID.test(action.left_card_id)&&CARD_ID.test(action.right_card_id)&&action.left_card_id!==action.right_card_id)action={type:'ask',question:'Compare '+action.left_card_id+' and '+action.right_card_id};
    else fail('invalid_action');
  }else if(ingress==='typed')action=typedAction(action,current);
  const semantic=ingress==='server'?'':typeof text==='string'?text.trim():'';
  const isText=ingress==='text'||ingress==='typed'&&['ask','reply'].includes(action.type);
  if(isText){
    const raw=semantic|| (action.type==='ask'?action.question:action.text)||'';
    const signals=extractSignals(raw),positive=acceptedLanguage(raw,signals.languages);
    const syntax=catalogSyntax(raw,signals,positive?.language||language,current);
    const boundNative=syntax?.reply===true;
    const field=current?.result?.next_step?.field||current?.next_step?.field;
    const boundCoordinate=signals.fractions.length===1&&/^(?:number|collector_number|coordinates)$/.test(field||'')&&/^\d{1,3}\/[a-z0-9-]{1,32}[.!。]?$/i.test(raw);
    const boundSet=signals.sets.length===1&&/^(?:release|set_code)$/.test(field||'')&&raw.replace(/[.!。]$/,'')===signals.sets[0];
    const isStatus=STATUS.test(raw);
    // RULE:reply_binding
    const isNarrowReply=(NARROW_REPLY.test(raw)||boundSet||boundNative)&&!signals.money&&!signals.grade&&(!signals.identity||boundCoordinate||boundSet||boundNative);
    // RULE:language_complete
    if(signals.languages.length&&!positive)local('language');
    // RULE:ambiguous_currency
    else if(/[$¥￥]/.test(raw))local('compound','ambiguous_currency');
    // RULE:identity_complete
    else if(signals.sets.length>1||signals.fractions.length>1)local('compound');
    // RULE:native_constraint_complete
    else if((signals.finishes.length||signals.releases.length)&&!syntax)local('compound');
    else if(signals.money||signals.grade){
      const patch=preferenceFromText(raw,current);
      // RULE:commercial_complete
      if(!patch||signals.identity||signals.search)local('compound');
      else if(!current?.result)local('task');
      else action={type:'preferences',preferences:patch};
    }else if(positive?.answer){
      language=positive.language;
      action=current?.result?{type:'refine',scope:{language}}:{type:'ask',question:LANG[language]};
    }else{
      const substantive=signals.identity||signals.search&&!isStatus;
      // RULE:intent_complete
      if(substantive&&!['ask','reply'].includes(action.type))local('compound');
      // RULE:local_control
      else if(action.type==='recommendation_status'&&!isStatus||action.type==='model_explanation'&&!(EXPLANATION.test(raw)||action.key==='capability_scope'&&UNSUPPORTED.test(raw)))local('task');
      else if(action.type==='refine'&&!positive?.answer)local('compound');
      else if(action.type==='preferences')local('compound');
      else if(boundNative&&['ask','reply'].includes(action.type))action={type:'reply',text:raw};
      else if(action.type==='ask'||action.type==='reply'&&substantive&&!isNarrowReply){
        language=positive?.language||language;
        const body=positive?positive.text:raw;
        // A model cannot supply omitted constraints or a rewritten name/number.
        const proposed=action.type==='ask'?action.question:raw;
        const stripped=proposed?.replace(/^(?:English|Japanese)\s+/i,'');
        if(typeof proposed!=='string'||proposed!==raw&&stripped!==raw&&!(positive&&proposed===raw))local('task');
        else action={type:'ask',question:(language?LANG[language]+' ':'')+body};
      }else if(action.type==='reply'&&!isNarrowReply)local('task');
      else if(signals.languages.length)local('language');
    }
    // RULE:held_language
    if(doc.languageClarificationPending&&!positive?.language&&!['recommendation_status','model_explanation'].includes(action.type))local('language');
    // RULE:held_task
    if(doc.modelClarificationPending&&(!['ask','refine','preferences','recommendation_status','model_explanation','language_clarification','model_clarification'].includes(action.type)||candidate?.action?.type==='reply'&&!signals.search&&!SUBJECT.test(raw)))local(doc.modelClarificationField||'task');
    if(!hold&&syntax)lexicalScope=syntax.scope;
    // RULE:whole_text_positive_grammar
    if(!hold&&['ask','reply'].includes(action.type)){
      if(action.type==='ask'){
        const forwarded=action.question,accepted=catalogSyntax(forwarded,extractSignals(forwarded),language,null,
          {explicitLegacySubject:/^find lucario cards[?!.]*$/i.test(raw)});
        const languageOnly=acceptedLanguage(forwarded,languageSignals(forwarded))?.answer===true;
        if(!accepted&&!languageOnly||accepted?.identity?.form&&accepted.identity.form!=='ex')local('compound');
        else if(accepted){identity=accepted.identity;lexicalScope={...lexicalScope,...accepted.scope};}
      }else{
        const confirmation=/^(?:yes|confirm|yes, that one|はい|确认|是)[.!。]?$/i.test(raw)&&/^(?:select|confirm)$/.test(field||'');
        if(action.text!==raw||!boundNative&&!boundSet&&!boundCoordinate&&!confirmation)local('compound');
      }
    }
  }
  if(ingress==='typed'&&!['ask','reply'].includes(action.type)){
    const languageChoice=action.type==='refine'&&LANG[action.scope?.language];
    if(doc.languageClarificationPending&&!languageChoice)fail('catalog_rejected_action');
    if(doc.modelClarificationPending&&!['refine','preferences'].includes(action.type))fail('catalog_rejected_action');
    if(languageChoice)language=action.scope.language;
  }
  if(['model_clarification','language_clarification'].includes(action.type)&&!hold)hold={field:action.type==='language_clarification'?'language':action.field,reason:action.reason||'uncertain'};
  // RULE:stored_workspace_admission
  // Even a new ask appends to native's existing transcript; it cannot cleanse
  // an earlier unsafe ask. Recovery requires a new chat/workspace.
  if(!['recommendation_status','model_explanation','language_clarification','model_clarification'].includes(action.type)&&!storedGoalsAccepted(current))local('task','catalog_stored_goal_requires_restart');
  const localOnly=['recommendation_status','model_explanation','language_clarification','model_clarification'].includes(action.type);
  if(!localOnly)typedAction(action,current);
  const preferences=copy(current?.result?.preferences||{});
  if(action.type==='preferences')Object.assign(preferences,action.preferences);
  const scope=scopeFor(action,action.question||action.text||'',language,current);
  Object.assign(scope,lexicalScope);
  const priorQuestion=current?.result?.goal_question;
  if(!identity&&action.type!=='ask'&&typeof priorQuestion==='string'){
    let previous=normalize(priorQuestion);
    const priorSignals=extractSignals(previous),priorPositive=acceptedLanguage(previous,priorSignals.languages);
    const language=priorPositive?.language||(/^(?:(?:English|Japanese)\s+)?find lucario cards[?!.]*$/i.test(previous)?languageCode(previous.match(/^(English|Japanese)\s+/i)?.[1]||''):null);
    if(priorPositive&&!priorPositive.answer&&!priorSignals.releases.length&&!priorSignals.finishes.length&&previous===previous.trim()){
      const forwarded=(language?LANG[language]+' ':'')+priorPositive.text;if(forwarded.length<=2000)previous=forwarded;
    }
    identity=catalogSyntax(previous,extractSignals(previous),language,null,
      {explicitLegacySubject:/^(?:(?:English|Japanese)\s+)?find lucario cards[?!.]*$/i.test(previous)})?.identity||null;
  }
  const recordQuestion=action.type==='ask'?action.question:priorQuestion||'';
  const recordIds=[...recordQuestion.matchAll(/\b(?:en|ja):[^:\s/\\?#]{1,80}:[A-Za-z0-9/._-]{1,80}:[^:\s/\\?#]{1,80}/g)].map(m=>m[0]);
  if(ingress==='server'&&recordIds.length){const languages=[...new Set(recordIds.map(id=>id.slice(0,2)))];if(languages.length===1){language=languages[0];scope.language=language;}}
  return makePlan({kind:'catalog',action,binding,languagePreference:language,constraints:{language:scope.language||null,scope,preferences,recordIds,identity},localOnly,hold});
}
function nativeEcho(plan,result){
  if(!plans.has(plan))fail('catalog_admission_required');
  if(plan.localOnly||plan.kind!=='catalog')fail('catalog_admission_required');
  const mismatch=()=>fail('catalog_admission_echo_mismatch'),{scope,preferences,language}=plan.constraints;
  if(!result||typeof result!=='object')mismatch();
  // RULE:native_echo
  if(language&&((result.scope_filters?.language!==undefined&&result.scope_filters.language!==language)||
    !Array.isArray(result.discovery?.languages)||JSON.stringify(result.discovery.languages)!==JSON.stringify([language])||
    (result.candidate_cards||[]).some(c=>c.language!==language)))mismatch();
  // Native does not echo filters inferred from ask text. The positive lexical
  // grammar above admits those filters; an absent echo cannot authorize extras.
  // RULE:native_echo_complete
  if(!language&&JSON.stringify(result.discovery?.languages)!==JSON.stringify(['ja','en'])||
    Object.keys(result.scope_filters||{}).some(key=>!Object.hasOwn(scope,key)))mismatch();
  for(const [key,value] of Object.entries(scope)){
    if(key==='language')continue;
    // Exact record questions can legitimately request more scope or return no
    // match. A result may not assert a different value for an admitted field.
    const observed=result.scope_filters?.[key];
    if(observed!==undefined&&observed!==null&&JSON.stringify(observed)!==JSON.stringify(value))mismatch();
    if((result.candidate_cards||[]).some(c=>c[key]===undefined||String(c[key]).toLowerCase()!==String(value).toLowerCase()))mismatch();
    if(result.selection_allowed===true&&observed==null&&!(result.candidate_cards||[]).length)mismatch();
  }
  for(const [key,value] of Object.entries(preferences))if(JSON.stringify(result.preferences?.[key])!==JSON.stringify(value))mismatch();
  if(plan.constraints.recordIds?.length){
    const ids=currentCards({result});
    if([...ids].some(id=>!plan.constraints.recordIds.includes(id)))mismatch();
    if(result.selection_allowed===true&&plan.constraints.recordIds.some(id=>!ids.has(id)))mismatch();
  }
  return true;
}
module.exports={admit,validatePlan,nativeEcho,extractSignals,storedGoalsAccepted};
