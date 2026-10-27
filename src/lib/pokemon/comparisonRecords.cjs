'use strict';
// The native comparison supplies scoped records, not enriched catalog facts.
function comparisonRecords(comparison,side){
  if(comparison?.schema!=='pokemon.card-comparison.v1'||!['left','right'].includes(side))return [];
  const records=comparison[side]?.records;
  if(!Array.isArray(records))return [];
  return records.filter(record=>record&&['card_id','name','language','set_code','collector_number','variant'].every(key=>typeof record[key]==='string'))
    .map(record=>({card_id:record.card_id,name:record.name,language:record.language,set_code:record.set_code,collector_number:record.collector_number,variant:record.variant,...(typeof record.provenance==='string'?{provenance:record.provenance}:{})}));
}
function canChooseComparison(comparison,side,id){const endpoint=comparison?.[side];return endpoint?.records_truncated===false&&['exact_record','coordinate_variants'].includes(endpoint.status)&&comparisonRecords(comparison,side).some(record=>record.card_id===id);}
module.exports={comparisonRecords,canChooseComparison};
