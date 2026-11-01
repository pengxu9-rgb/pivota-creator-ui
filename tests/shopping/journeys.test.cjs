'use strict';
const test=require('node:test');
const {runEvaluation,assertAcceptance}=require('./evaluate.cjs');
test('shopping: both frozen arms complete all eighty episodes, twelve adversaries and six faults',async()=>{assertAcceptance(await runEvaluation());});
