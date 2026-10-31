'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validateModelProposal,projectModelAction}=require('../src/lib/pokemon/modelTurn.cjs');
const NON_SPAN=['clarify','explain','reply','status','unsupported'];
const INPUT={state_version:7,text:'English yes'};
const proposal=intent=>({schema:'pokemon.interpret-turn.v1',state_version:7,intent,
  explanation_key:intent==='explain'?'current_results':'none',clarification_field:intent==='clarify'?'language':'none'});
const contexts=[{text:INPUT.text,doc:{version:7,languagePreference:null,messages:[]},current:null},
  {text:INPUT.text,doc:{version:7,languagePreference:'en',messages:[]},current:{version:3,result:{goal_question:'Find cards',scope_filters:{language:'en'},preferences:{currency:'USD',budget_minor:5000},next_step:{field:'variant',prompt:'Which finish?'}}}}];
const invalid=value=>assert.throws(()=>validateModelProposal(value,INPUT),error=>error.code==='invalid_model_proposal');

for(const intent of NON_SPAN)test('absent spans normalise without changing projection: '+intent,()=>{
  const absent=proposal(intent),before=structuredClone(absent),legacy={...absent,source_spans:[]};
  const normal=validateModelProposal(absent,INPUT),old=validateModelProposal(legacy,INPUT);
  assert.deepEqual(normal,legacy);assert.deepEqual(Object.keys(normal).sort(),Object.keys(legacy).sort());
  assert.deepEqual(normal.source_spans,[]);assert.deepEqual(absent,before,'input is never mutated');
  assert.notEqual(normal,absent);assert.notEqual(normal.source_spans,legacy.source_spans);
  for(const context of contexts){const unchanged=structuredClone(context);
    assert.equal(JSON.stringify(projectModelAction(normal,context)),JSON.stringify(projectModelAction(old,context)));
    assert.deepEqual(context,unchanged);
  }
});

test('span intents still require their source_spans key',()=>{
  for(const intent of ['search','refine_language','preferences'])invalid(proposal(intent));
});

test('supplied spans are never discarded or coerced',()=>{
  for(const intent of [...NON_SPAN,'search','refine_language','preferences']){
    const value=proposal(intent);
    for(const bad of [null,undefined,{},'',0,false])invalid({...value,source_spans:bad});
    if(NON_SPAN.includes(intent))invalid({...value,source_spans:[{field:'language',text:'English'}]});
  }
});

test('missing other keys, unknown sixth keys, enums and stale versions stay rejected',()=>{
  for(const intent of NON_SPAN){const value=proposal(intent);
    for(const name of ['extra','spans','source_span','action'])invalid({...value,[name]:[]});
    for(const name of Object.keys(value)){const copy={...value};delete copy[name];invalid(copy);}
    invalid({...value,state_version:8});invalid({...value,schema:'other'});
    invalid({...value,explanation_key:'other'});invalid({...value,clarification_field:'other'});
  }
  invalid({...proposal('clarify'),clarification_field:'none'});
  invalid({...proposal('explain'),explanation_key:'none'});
});
