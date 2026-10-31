'use strict';
const assert=require('node:assert/strict');
const catalog=require('../fixtures/shopping/catalog.json');
const journeys=require('../fixtures/shopping/journeys.json');
const {createShopping}=require('../../src/lib/pokemon/shopping/facade.cjs');
function setup(options={}){
 let now=catalog.clock,seq=0;const native=[];
 const shop=createShopping({catalog,clock:()=>now,nativeProbe:t=>native.push(t),...options});
 const scope={tenant:'tenant_fixture',app:'pot_fixture',user:'user_fixture'};
 const principals=Object.fromEntries(['ui','model','worker'].map(role=>[role,shop.issuePrincipal(scope,role)]));
 const task=shop.createTask(principals.ui),taskRef=task.id;
 const state=()=>shop.ledger.snapshot(principals.ui,taskRef);
 const args=fields=>({task_ref:taskRef,request_id:'request_'+(++seq),expected_version:state().state_version,cancellation_epoch:state().cancellation_epoch,...fields});
 const call=(role,name,fields)=>shop.call(principals[role],name,{task_ref:taskRef,...fields});
 const humanArgs=(name,fields)=>{const a=args(fields);a.human_action_ref=shop.issueAction(principals.ui,name,a);return a;};
 const human=(name,fields)=>shop.call(principals.ui,name,humanArgs(name,fields));
 return {shop,principals,scope,taskRef,state,args,call,human,humanArgs,native,clock:()=>now,advance:ms=>now+=ms};
}
function ok(reply){assert.equal(reply.ok,true,JSON.stringify(reply));return reply.result;}
function denied(reply,code){assert.equal(reply.ok,false,JSON.stringify(reply));if(code)assert.equal(reply.error.code,code);return reply.error;}
async function select(h,j=journeys.journeys[0],changes={}){return ok(await h.human('select_offer',{offer_ref:j.offer_ref,requirements:{...j.requirements,...changes}}));}
async function preview(h,role='model'){const t=h.state();return ok(await h.call(role,'create_checkout_session',h.args({selection_ref:t.selection.id,route:t.accepted.route,destination_ref:t.accepted.destination_ref,quantity:1})));}
async function ready(h,j=journeys.journeys[0],changes={}){await select(h,j,changes);return preview(h);}
async function approve(h){return ok(await h.human('approve_purchase',{preview_ref:h.state().preview.id}));}
async function queued(h,j=journeys.journeys[0],changes={}){await ready(h,j,changes);const r=await approve(h);return r.operation_ref;}
const workerArgs=(h,op)=>h.args({operation_ref:op});
module.exports={assert,setup,ok,denied,select,preview,ready,approve,queued,workerArgs,journeys,catalog};
