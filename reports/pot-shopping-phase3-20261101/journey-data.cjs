'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const training=require('../../tests/fixtures/shopping-model-eval/journeys-v2.json');
const fields=new Set(['language','budget','grade','printing','condition','purpose','quantity','destination']);
const selectionFields=Object.freeze({
 language:'language',
 budget:'budget_minor',
 grade:'grade_kind',
 printing:'printing_ref',
 condition:'condition_bucket',
 quantity:'quantity',
 destination:'destination_ref'
});
function selectionSupplies(step,requirements){
 if(!Array.isArray(step.supplies))return [];
 return step.supplies.filter(field=>{
  if(!Object.hasOwn(selectionFields,field))return false;
  const value=requirements?.[selectionFields[field]];
  return typeof value==='string'&&value.trim()!==''||Number.isSafeInteger(value)&&value>0;
 });
}
function v2(j){
 if(j.steps)return j;
 const row=training.journeys.find(x=>x.id===j.id);
 if(!row)throw Error('journey_v2_required');
 return {...row,...j,steps:row.steps};
}
function fixture(j,base=ROOT){return JSON.parse(fs.readFileSync(path.resolve(base,j.catalog),'utf8'));}
// Supply annotations belong to the frozen scripted user, never to model output or the answer oracle.
// A missing field is latched at the first selection/preview boundary; later answers cannot erase it.
function questionMeasure(j){
 const unresolved={...j.answer_key},supplied=new Set(),missed=new Set();
 function record(fields){for(const field of fields){supplied.add(field);delete unresolved[field];}}
 return {
  supply(step){if(step.supplies&&!Array.isArray(step.supplies))record(Object.keys(step.supplies));},
  supplySelection(step,requirements){record(selectionSupplies(step,requirements));},
  answer(field,fallback){const has=Object.hasOwn(unresolved,field),answer=has?unresolved[field]:fallback;if(has)supplied.add(field);delete unresolved[field];return {field,unnecessary:!has,answer};},
  boundary(){for(const f of j.required_fields)if(!supplied.has(f))missed.add(f);},
  count:()=>missed.size
 };
}
async function steps(rows,dispatch){for(const step of rows)await dispatch(step);}
module.exports={v2,fixture,questionMeasure,selectionSupplies,steps,training,fields,ROOT};
