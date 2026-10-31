'use strict';
const assert=require('node:assert/strict');
// Independent evidence oracle. These are the full English subject lexicon,
// not names recovered by scanning an unconsumed user sentence.
const subjects=[
  ['Charizard',6,['リザードン','喷火龙','噴火龍']],['Pikachu',25,['ピカチュウ','皮卡丘']],
  ['Mewtwo',150,['ミュウツー']],['Mew',151,['ミュウ']],['Eevee',133,['イーブイ']],
  ['Bulbasaur',1,['フシギダネ']],['Squirtle',7,['ゼニガメ']],['Charmander',4,['ヒトカゲ']],
  ['Umbreon',197,['ブラッキー']],['Gengar',94,['ゲンガー']],['Lugia',249,['ルギア']],
  ['Rayquaza',384,['レックウザ']],['Snorlax',143,['カビゴン']],['Greninja',658,['ゲッコウガ']],
  ['Dragonite',149,['カイリュー']],['Blastoise',9,['カメックス']],['Venusaur',3,['フシギバナ']],
].map(([name,dexId,aliases])=>({name,dexId,aliases:[name,...aliases]}));
// An exact pre-existing explicit-search control is admitted outside the
// completeness lexicon. It does not expand the generated lexicon matrix.
const identitySubjects=[...subjects,{name:'Lucario',dexId:448,aliases:['Lucario','ルカリオ']}];
const fold=s=>String(s||'').normalize('NFKC').toLowerCase();
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function namedFamily(name){
  const text=fold(name);
  return identitySubjects.find(s=>s.aliases.some(alias=>/[a-z]/i.test(alias)?new RegExp('(?:^|[^a-z])'+escaped(fold(alias))+'(?:$|[^a-z])','u').test(text):text.includes(alias)))||null;
}
function subjectValue(identity){
  const value=identity?.subject;
  if(!value)return null;
  if(typeof value==='object')return identitySubjects.find(s=>s.dexId===(value.dexId??value.dex_id)||fold(s.name)===fold(value.canonicalName??value.name))||null;
  return identitySubjects.find(s=>s.aliases.some(alias=>fold(alias)===fold(value)))||null;
}
function cardFamily(card){
  const dex=card.dex_id??card.dexId??card.official_metadata?.official?.dex_id;
  return identitySubjects.find(s=>s.dexId===Number(dex))||namedFamily(card.name??card.title??'');
}
function cardForm(card){
  const match=fold(card.name??card.title??'').match(/(?:\s|-)(vmax|vstar|gx|ex|v)$/u)||fold(card.name??card.title??'').match(/(vmax|vstar|gx|ex|v)$/u);
  return match?match[1]:null;
}
function candidateIdentityChecks(plan,cards){
  const identity=plan.constraints.identity||{},subject=subjectValue(identity),form=identity.form?fold(identity.form):null;
  const families=cards.map(cardFamily),uniqueFamilies=[...new Set(families.map(s=>s?.name??null))],forms=cards.map(cardForm),uniqueForms=[...new Set(forms)];
  const exactRecord=!!plan.constraints.recordIds?.length;
  if(cards.length&&!exactRecord){
    if(identity.subject)assert.ok(subject,'admitted_subject_missing_from_oracle: '+JSON.stringify(identity.subject));
    if(subject)for(let index=0;index<cards.length;index++)assert.equal(families[index]?.dexId,subject.dexId,'candidate_character_differs_from_admitted_subject: '+cards[index].name);
    if(uniqueFamilies.length===1&&uniqueFamilies[0]!==null)assert.ok(subject,'all_candidates_share_unadmitted_character: '+uniqueFamilies[0]);
    if(form)for(let index=0;index<cards.length;index++)assert.equal(forms[index],form,'candidate_title_suffix_differs_from_admitted_form: '+cards[index].name);
    if(uniqueForms.length===1&&uniqueForms[0]!==null)assert.equal(form,uniqueForms[0],'all_candidates_share_unadmitted_title_suffix: '+uniqueForms[0]);
  }
  return [{field:'character',admitted:subject?{name:subject.name,dex_id:subject.dexId}:null,observed_unique:uniqueFamilies,all_candidates_share:cards.length>0&&uniqueFamilies.length===1,method:'source dex_id when present, otherwise explicit English/Japanese/Chinese name-family aliases'},
    {field:'title_suffix',admitted:form,observed_unique:uniqueForms,all_candidates_share:cards.length>0&&uniqueForms.length===1,method:'NFKC title suffix: ex, V, VMAX, VSTAR, GX'}];
}
module.exports={subjects,identitySubjects,namedFamily,subjectValue,cardFamily,cardForm,candidateIdentityChecks};
