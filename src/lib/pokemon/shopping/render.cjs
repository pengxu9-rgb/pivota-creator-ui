'use strict';
const {fail}=require('./schema.cjs');
const {current}=require('./evidence.cjs');
function renderClaim({evidence,task,clock,claim}){
 if(!claim||Object.keys(claim).some(k=>!['evidence_ref','slot'].includes(k))||typeof claim.evidence_ref!=='string')fail('unsupported_claim');const record=evidence.read(claim.evidence_ref,{task});if(!current(record,clock(),86400000))fail('stale_evidence','read_refresh');
 if(record.kind==='offer'&&(!evidence.isLatest(record)||!evidence.qualified(record)))fail('stale_evidence','read_refresh');
 switch(claim.slot){
  case 'price':if(record.kind!=='offer'||record.price_minor===null||!record.currency)fail('unsupported_claim');return record.currency+' '+record.price_minor+' minor units · synthetic item ask';
  case 'total':if(record.kind!=='preview'||record.total_minor===null||record.status!=='complete')fail('unsupported_claim');return record.currency+' '+record.total_minor+' minor units · synthetic delivered total';
  case 'item':case 'shipping':case 'fee':case 'tax':{const value=record[claim.slot+'_minor'];if(record.kind!=='preview'||typeof value!=='string'||!record.currency)fail('unsupported_claim');return record.currency+' '+value+' minor units · synthetic '+claim.slot;}
  case 'currency':if(!record.currency)fail('unsupported_claim');return record.currency+' · synthetic';
  case 'url':if(!record.url||!record.url.startsWith('https://example.invalid/'))fail('unsupported_claim');return record.url;
  case 'status':if(!['operation','order','case'].includes(record.kind)||!record.status)fail('unsupported_claim');return record.status+' · synthetic';
  case 'expiry':return new Date(record.expires_at).toISOString()+' · synthetic evidence expiry';
  default:fail('unsupported_claim');
 }
}
const renderAssumptions=rows=>[...new Set(rows.map(r=>{if(r.confirmed!==false||!['Assuming JPY item price · change','Assuming Pikachu · change'].includes(r.label))fail('unsupported_claim');return r.label;}))];
module.exports={renderClaim,renderAssumptions};
