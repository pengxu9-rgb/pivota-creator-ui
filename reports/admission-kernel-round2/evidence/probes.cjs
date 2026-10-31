'use strict';
// Snapshot of Claude's read-only review inputs. Repeated 4b cases remain
// present, with their source filename, so execution and unique counts differ.
const fixture=require('./review-probes.json');
const fullwidth=text=>text.replace(/[!-~]/g,c=>String.fromCharCode(c.charCodeAt(0)+0xfee0)).replace(/ /g,'\u3000');
const finishAliases=require('../../../src/lib/pokemon/admissionVocabulary.json').finishes.map(row=>row.alias);
function releaseSample(){
  const {createHash}=require('node:crypto');
  const vocabulary=require('../../../src/lib/pokemon/admissionVocabulary.json');
  const releases=vocabulary.releases;
  if(!Array.isArray(releases))throw Error('admission_vocabulary_releases_missing');
  const unique=[...new Map(releases.filter(row=>row.sources.includes('catalog_set_localized.name')).map(row=>[row.alias,row])).values()];
  // Stable hash ordering avoids selecting just one alphabetical release family.
  return unique.map(row=>({...row,sample_hash:createHash('sha256').update(row.alias).digest('hex')}))
    .sort((a,b)=>a.sample_hash.localeCompare(b.sample_hash)).slice(0,20);
}
const whitespaceProbes=[['001c','\u001c'],['001d','\u001d'],['001e','\u001e'],['001f','\u001f'],['0085','\u0085']]
  .flatMap(([codepoint,separator])=>['master','poke'].map(word=>({id:'WS_'+word+'ball_'+codepoint,initial:'Japanese Pikachu cards',text:'Find Pikachu cards without '+word+separator+'ball',source:'round2-native-whitespace'})));
const moneyProbes=['Find Charizard cards ٥٠','Find Charizard cards ५०','Find Charizard cards ৫০','Find Charizard cards ja:50','Find Charizard cards ja:x\u008550']
  .map((text,index)=>({id:'NUM_unadmitted_budget_'+(index+1),initial:'English Charizard cards',text,prefs:{currency:'USD',budget_minor:100000,grade_company:'PSA',grade_value:'10'},source:'round2-unicode-numbers'}));
const supplementalProbes=[...whitespaceProbes,...moneyProbes];
const mustHold=p=>/^(?:V[1-6]_|S[23]_|U[124]_|[MG][1-4]_|SEL_|E[123]_|WS_|NUM_)/.test(p.id);
const positive=p=>['ctrl_positive_holo','S1_release_only_from','U3_fullwidth_english_positive_nolang','B2_find_lucario_off'].includes(p.id);
module.exports={...fixture,supplementalProbes,whitespaceProbes,moneyProbes,fullwidth,finishAliases,releaseSample,mustHold,positive};
