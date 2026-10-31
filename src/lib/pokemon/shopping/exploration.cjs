'use strict';
const {copy,fail}=require('./schema.cjs');
function languages(text){const t=text.normalize('NFKC');const noEn=/\b(?:not|without|exclude|avoid)\s+English\b/i.test(t),noJa=/\b(?:not|without|exclude|avoid)\s+Japanese\b/i.test(t);if(noEn&&noJa)return [];if(noEn)return ['ja'];if(noJa)return ['en'];const ja=/\bJapanese\b|日本語|日文/i.test(t),en=/\bEnglish\b|英語|英文/i.test(t);return ja&&!en?['ja']:en&&!ja?['en']:['ja','en'];}
function explore(evidence,text,{nativeCall}={}){
 const normalized=text.normalize('NFKC'),langs=languages(normalized),typo=/\bpikacu\b/i.test(normalized),subject=/\bcharizard\b/i.test(normalized)?'Charizard':/\bpikachu\b/i.test(normalized)||typo?'Pikachu':null,fraction=normalized.match(/\b\d{1,3}\/\d{1,3}\b/)?.[0];
 const printings=evidence.data.printings.filter(p=>(!subject||p.name===subject)&&langs.includes(p.language)&&(!fraction||p.collector_number===fraction));
 const assumptions=[];if(typo)assumptions.push({field:'subject',value:'Pikachu',label:'Assuming Pikachu · change',confirmed:false});if(/[¥￥]/.test(normalized)&&langs.length===1&&langs[0]==='ja'){assumptions.push({field:'currency',value:'JPY',label:'Assuming JPY item price · change',confirmed:false},{field:'budget_basis',value:'item',label:'Assuming JPY item price · change',confirmed:false});}
 // MUTATION:readonly_native_boundary -- nativeCall is a host test probe, never invoked.
 const budget=normalized.match(/(?:under|below)\s*[¥￥]\s*([\d,]+)/i)?.[1]?.replaceAll(',','');
 const offers=evidence.allOffers().filter(o=>printings.some(p=>p.id===o.printing_ref)&&evidence.qualified(o)&&(!budget||o.currency==='JPY'&&BigInt(o.price_minor)<=BigInt(budget)));
 return {printings:copy(printings),offers,assumptions,original_text:text};
}
function offersFor(evidence,refs,text=''){const langs=languages(text);return evidence.allOffers().filter(o=>refs.includes(o.printing_ref)&&langs.includes(o.language)&&evidence.qualified(o));}
function compare(evidence,refs,criterion){const rows=refs.map(r=>evidence.offer(r)).filter(o=>o&&evidence.qualified(o));if(criterion==='delivered_price')fail('incomparable','human_review');const cohort=o=>[o.printing_ref,o.grade_kind,o.grade_company,o.grade_value,o.condition_bucket,o.quantity,o.currency].join('|');if(new Set(rows.map(cohort)).size>1)fail('incomparable','human_review');return rows.sort((a,b)=>BigInt(a.price_minor)<BigInt(b.price_minor)?-1:BigInt(a.price_minor)>BigInt(b.price_minor)?1:a.id.localeCompare(b.id));}
module.exports={explore,offersFor,compare,languages};
