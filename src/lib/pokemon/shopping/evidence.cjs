'use strict';
const {copy,hash,fail,validateRecord}=require('./schema.cjs');
const CEILINGS=Object.freeze({exploration:86400000,offer:300000,preview_capture:60000,seller:86400000,certificate:86400000,fx:900000,quote:300000});
const exponent=currency=>({JPY:0,USD:2,HKD:2}[currency]??fail('unsupported_currency'));
function toMinor(amount,currency){const scale=exponent(currency);if(typeof amount!=='string'||!/^\d+(?:\.\d+)?$/.test(amount))fail('invalid_money');const [whole,fraction='']=amount.split('.');if(fraction.length>scale)fail('invalid_money');const result=BigInt(whole)*10n**BigInt(scale)+BigInt(fraction.padEnd(scale,'0')||'0');if(result>999999999999n)fail('invalid_money');return result.toString();}
const minor=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,11})$/.test(v);
const scopeKey=m=>JSON.stringify([m.tenant,m.app,m.user]);
function current(record,now,maxAge=CEILINGS.offer){return !!record&&record.synthetic===true&&Number.isFinite(record.observed_at)&&record.observed_at<=now&&now-record.observed_at<=maxAge&&Number.isFinite(record.expires_at)&&now<record.expires_at;}
function createEvidence(catalog,clock){
 const data=copy(catalog),all=new Map(),latest=new Map(),metadata=new Map();let seq=0;
 function put(input,binding=null){const record=copy(input);record.synthetic=true;if(!record.evidence_ref)record.evidence_ref='evidence_'+(++seq);if(record.observed_at===undefined)record.observed_at=clock();if(record.expires_at===undefined)record.expires_at=clock()+CEILINGS.exploration;validateRecord(record);all.set(record.evidence_ref,Object.freeze(record));latest.set(record.id,record.evidence_ref);if(binding)metadata.set(record.evidence_ref,copy(binding));return copy(record);}
 for(const row of [...data.printings,...data.sellers,...data.offers,data.certificate])put(row);
 const source=new Map(data.sources.map(s=>[s.id,s])),printing=id=>data.printings.find(p=>p.id===id),offer=id=>{const r=all.get(latest.get(id));return r?.kind==='offer'?copy(r):null;};
 function qualified(o,req=null){const p=o&&printing(o.printing_ref);if(!p||!current(o,clock())||source.get(o.source_ref)?.permission!=='confirmed_fixture_only'||o.source_permission!==true||o.availability!=='available'||!minor(o.price_minor)||!['JPY','USD','HKD'].includes(o.currency)||o.quantity!==1)return false;
  for(const key of ['language','set_code','collector_number','finish','grade_kind','grade_company','grade_value','condition_bucket','quantity'])if(o[key]!==p[key])return false;
  if(req)for(const key of ['printing_ref','language','finish','grade_kind','grade_company','grade_value','condition_bucket','quantity','currency'])if(o[key]!==req[key])return false;
  return true;
 }
 function read(ref,{task=null}={}){const r=all.get(ref)||all.get(latest.get(ref));if(!r)fail('evidence_not_found');const b=metadata.get(r.evidence_ref);if(b){if(!task||task.id!==b.task_ref||task.owner!==b.owner)fail('scope_denied');if(b.kind==='preview'&&task.preview?.id!==r.id||b.kind==='selection'&&task.selection?.id!==r.id)fail('stale_evidence','read_refresh');if(b.kind==='operation'&&task.operations[r.operation_ref]?.operation_revision!==b.revision)fail('stale_evidence','read_refresh');}return copy(r);}
 function updateOffer(id,patch){const old=offer(id);if(!old)fail('offer_not_found');return put({...old,observed_at:clock(),expires_at:clock()+CEILINGS.offer,...copy(patch),evidence_ref:'evidence_capture_'+(++seq)});}
 return {data,put,read,offer,printing,qualified,updateOffer,allOffers:()=>data.offers.map(o=>offer(o.id)),hashRecord:r=>hash(r),isLatest:r=>latest.get(r.id)===r.evidence_ref,current:(r,age)=>current(r,clock(),age)};
}
module.exports={createEvidence,CEILINGS,toMinor,minor,scopeKey,current};
