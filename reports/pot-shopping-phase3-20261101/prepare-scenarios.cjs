'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),old=require(root+'/tests/shopping/evaluate.cjs');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,a);return s.replace(a,b);};
let a=old.adversarialCase.toString(),f=old.faultCase.toString();
a=once(a,'async function adversarialCase(row)','async function adversarialCase(row,h,model)');a=once(a,'const h=setup(),base=','const base=');
const attacks=[
["assert.equal(nativeHeld(m.text),true);const r=", "assert.equal(nativeHeld(m.text),true);await model();const r="],
["h.shop.evidence.updateOffer('offer_A',m);denied", "h.shop.evidence.updateOffer('offer_A',m);await model();denied"],
["h.shop.evidence.updateOffer('offer_A',m);ok", "h.shop.evidence.updateOffer('offer_A',m);await model();ok"],
["case 'X06':denied", "case 'X06':await model({sellerDescription:m.description});denied"],
["h.advance(m.clock_offset);await", "h.advance(m.clock_offset);await model();await"],
["h.shop.sim.setFault('wrong_destination');denied", "h.shop.sim.setFault('wrong_destination');await model();denied"],
["h.shop.sim.setFault('unknown_shipping');assert", "h.shop.sim.setFault('unknown_shipping');await model();assert"],
["const before=h.shop.evidence.offer('offer_A').price_minor;denied", "const before=h.shop.evidence.offer('offer_A').price_minor;await model();denied"],
["other=h.shop.issuePrincipal({...h.scope,app:m.other_app},'model');denied", "other=h.shop.issuePrincipal({...h.scope,app:m.other_app},'model');await model({principal:other});denied"],
["await h.shop.ledger.cancel(h.principals.ui,h.taskRef);await", "await h.shop.ledger.cancel(h.principals.ui,h.taskRef);await model();await"]];
for(const [from,to]of attacks)a=once(a,from,to);
f=once(f,'async function faultCase(row)','async function faultCase(row,h,model)');f=once(f,'const h=setup();let op;','let op;');
const faultEdits=[
["h.shop.sim.setFault('price_change');assert", "h.shop.sim.setFault('price_change');await model();assert"],
["h.shop.sim.setFault('out_of_stock');await", "h.shop.sim.setFault('out_of_stock');await model();await"],
["await Promise.all([h.shop.worker.drain", "await model();await Promise.all([h.shop.worker.drain"],
["status,'unknown');await h.shop.worker.drain", "status,'unknown');await model();await h.shop.worker.drain"],
["status,'partial');ok(await h.human", "status,'partial');await model();ok(await h.human"]];
for(const [from,to]of faultEdits)f=once(f,from,to);
fs.writeFileSync(root+'/tests/shopping/model/scenarios.cjs',"'use strict';\n// Derived unchanged phase2 oracles; same host and model hook at each fault boundary.\nconst {assert,setup,ok,denied,ready,queued,select,preview,approve,workerArgs,journeys}=require('../helpers.cjs');\nconst {nativeHeld}=require('../evaluate.cjs');\n"+a+'\n'+f+'\nmodule.exports={adversarialCase,faultCase};\n');
