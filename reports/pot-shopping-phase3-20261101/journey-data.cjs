'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const training=require('../../tests/fixtures/shopping-model-eval/journeys-v2.json');
const fields=new Set(['language','budget','grade','printing','condition','purpose','quantity','destination']);
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
 function supply(step){for(const field of Array.isArray(step.supplies)?step.supplies:Object.keys(step.supplies||{})){supplied.add(field);delete unresolved[field];}}
 return {supply,answer(field,fallback){const has=Object.hasOwn(unresolved,field),answer=has?unresolved[field]:fallback;if(has)supplied.add(field);delete unresolved[field];return {field,unnecessary:!has,answer};},boundary(){for(const f of j.required_fields)if(!supplied.has(f))missed.add(f);},count:()=>missed.size};
}
async function steps(rows,dispatch){for(const step of rows)await dispatch(step);}
module.exports={v2,fixture,questionMeasure,steps,training,fields,ROOT};
