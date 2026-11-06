'use strict';
const test=require('node:test');
const {assert,setup}=require('../helpers.cjs'),{adversarialCase,faultCase}=require('./scenarios.cjs');
const attacks=require('../../fixtures/shopping/adversarial.json'),faults=require('../../fixtures/shopping/faults.json');
for(const [kind,rows,oracle]of [['attack',attacks.cases,adversarialCase],['fault',faults.cases,faultCase]])for(const row of rows)test('model eval same-state '+kind+': '+row.id,async()=>{const h=setup();let calls=0;const result=await oracle(row,h,async options=>{calls++;const before=h.state(),stats=h.shop.sim.stats();if(row.id==='X07')assert.ok(h.clock()>h.state().preview.expires_at);if(row.id==='X06')assert.equal(options.sellerDescription,row.mutation.description);await h.shop.call(options?.principal||h.principals.model,'search_catalog',{task_ref:h.taskRef,text:'Pikachu'});assert.deepEqual(h.state(),before);assert.deepEqual(h.shop.sim.stats(),stats);});assert.equal(calls,1);assert.equal(result.passed,true);});
