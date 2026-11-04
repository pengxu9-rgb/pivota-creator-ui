'use strict';
// Counts-only validator. Never invokes a transport, credential helper or model.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {hash,validateRecord,conforms,schemas}=require('../../src/lib/pokemon/shopping/schema.cjs');
const {createEvidence}=require('../../src/lib/pokemon/shopping/evidence.cjs');
const {fields,ROOT}=require('./journey-data.cjs');
const allowed={select:['changes','supplies'],preview:['expect','measure'],compare_offers:['offer_refs','criterion'],search_catalog:['text','measure'],get_product:['printing_ref'],observe_offer:[],fault:['name'],deny_approval:[],get_operation:[],drain:[]};
function check(ok){assert.ok(ok,'invalid_synthetic_journey_set');}
function safe(value){
 if(typeof value==='string'){
  check(!/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(value));
  for(const s of value.match(/https?:\/\/[^\s"<>]+/g)||[]){const u=new URL(s);check(u.protocol==='https:'&&u.hostname==='example.invalid'&&!u.username&&!u.password&&!u.port);}
 }else if(Array.isArray(value))value.forEach(safe);
 else if(value&&typeof value==='object')for(const [key,v] of Object.entries(value)){check(!/token|password|authorization|secret/i.test(key));safe(v);}
}
function validate(set,catalogs){
 check(set?.schema==='shopping.journeys.v2'&&set.synthetic===true&&Number.isSafeInteger(set.clock));
 check(Array.isArray(set.journeys)&&set.journeys.length>0&&set.journeys.length<=100);safe(set);
 check(set.unexpected_question_rule?.fallback===require('../../tests/fixtures/shopping/journeys.json').unexpected_question_rule.fallback);
 check(hash(set.unexpected_question_rule)===hash(require('../../tests/fixtures/shopping/journeys.json').unexpected_question_rule));
 const ids=new Set();let stepCount=0;const seenCatalogs=new Set();
 for(const j of set.journeys){
  check(typeof j.id==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(j.id)&&!ids.has(j.id));ids.add(j.id);
  check(typeof j.query==='string'&&j.query.length>0&&j.query.length<=10000);
  check(typeof j.catalog==='string'&&catalogs[j.catalog]);const c=catalogs[j.catalog];seenCatalogs.add(j.catalog);
  check(c.synthetic===true&&c.schema==='shopping.synthetic.catalog.v1'&&c.clock===set.clock);safe(c);
  const records=[...c.printings,...c.sellers,...c.offers,c.certificate],refs=new Set(),evidenceRefs=new Set();
  for(const row of records){check(row.synthetic===true&&!refs.has(row.id));refs.add(row.id);validateRecord(row);if(row.evidence_ref){check(!evidenceRefs.has(row.evidence_ref));evidenceRefs.add(row.evidence_ref);}}
  // The unchanged evidence store assigns missing printing evidence refs deterministically.
  const ev=createEvidence(c,()=>c.clock);for(const row of records)check(!!ev.read(row.id).evidence_ref);
  for(const source of c.sources)check(source.synthetic===true&&source.permission==='confirmed_fixture_only');
  const sources=new Set(c.sources.map(r=>r.id)),destinations=new Set(c.destinations.map(r=>r.id));
  check(sources.size===c.sources.length&&destinations.size===c.destinations.length&&c.destinations.every(r=>r.synthetic===true));
  const allRefs=new Set([...refs,...evidenceRefs,...sources,...destinations]);
  for(const row of records)for(const [key,value] of Object.entries(row))if(key.endsWith('_ref')&&value!==null)check(allRefs.has(value));
  for(const offer of c.offers){check(c.printings.some(p=>p.id===offer.printing_ref)&&c.sellers.some(s=>s.id===offer.seller_ref)&&sources.has(offer.source_ref));check(offer.source_permission===true&&new URL(offer.url).hostname==='example.invalid');check(!offer.certificate_ref||offer.certificate_ref===c.certificate.id);check(ev.qualified(offer));}
  check(j.answer_key&&typeof j.answer_key==='object'&&!Array.isArray(j.answer_key));
  for(const [f,a] of Object.entries(j.answer_key))check(fields.has(f)&&typeof a==='string'&&a.length>0&&a.length<=10000);
  check(Array.isArray(j.required_fields)&&new Set(j.required_fields).size===j.required_fields.length&&j.required_fields.every(f=>Object.hasOwn(j.answer_key,f)));
  check(c.offers.some(o=>o.id===j.offer_ref)&&c.printings.some(p=>p.id===j.requirements?.printing_ref)&&destinations.has(j.requirements.destination_ref));
  check(conforms(j.requirements,schemas['common.schema.json'].$defs.requirements,'common.schema.json'));
  check(ev.qualified(ev.offer(j.offer_ref),j.requirements));
  let selected=false,complete=false,query=false,first=false;
  check(Array.isArray(j.steps)&&j.steps.length>0&&j.steps.length<=100);
  for(const [post,rows] of [[false,j.steps],[true,j.after_approval||[]]])for(const s of rows){
   stepCount++;check(s&&typeof s==='object'&&!Array.isArray(s));
   if(Object.hasOwn(s,'user')){
    check(!Object.hasOwn(s,'interface')&&typeof s.user==='string'&&s.user.length>0&&s.user.length<=10000);
    check(Object.keys(s).every(k=>['user','model','supplies','baseline_question','native_hold','proposed_only'].includes(k)));
    check(s.model===undefined||typeof s.model==='boolean');query ||=s.user===j.query;
    check(!Array.isArray(s.supplies));for(const [f,span] of Object.entries(s.supplies||{}))check(fields.has(f)&&typeof span==='string'&&span.length>0&&s.user.includes(span));
   }else{
    check(Object.hasOwn(allowed,s.interface)&&Object.keys(s).every(k=>k==='interface'||allowed[s.interface].includes(k)));
    if(post)check(['get_operation','drain'].includes(s.interface));
    if(s.interface==='select'){selected=true;check(Array.isArray(s.supplies)&&new Set(s.supplies).size===s.supplies.length&&s.supplies.every(f=>fields.has(f)));check(!s.changes||Object.keys(s.changes).every(k=>k==='budget_minor')&&/^\d+$/.test(s.changes.budget_minor));}
    if(s.interface==='preview'){check(selected&&['complete','terms_changed','partial'].includes(s.expect));if(s.expect==='terms_changed')selected=false;if(s.measure==='complete_preview'){check(s.expect==='complete');complete=true;}}
    if(s.measure==='first_offer'){check(s.interface==='search_catalog'&&!first);first=true;}
    check(!s.measure||['first_offer','complete_preview'].includes(s.measure));
    if(s.interface==='search_catalog')check(typeof s.text==='string'&&s.text.length>0);
    if(s.interface==='compare_offers')check(Array.isArray(s.offer_refs)&&s.offer_refs.length>0&&s.offer_refs.every(r=>c.offers.some(o=>o.id===r))&&s.criterion==='item_price');
    if(s.interface==='get_product')check(c.printings.some(p=>p.id===s.printing_ref));
    if(s.interface==='fault')check(['price_change','timeout_after_submit'].includes(s.name));
   }
  }
  check(query&&first&&complete&&selected);
 }
 return {journeys:ids.size,catalogs:seenCatalogs.size,steps:stepCount};
}
function external(file){const real=fs.realpathSync(file),rel=path.relative(ROOT,real);check(rel==='..'||rel.startsWith('..'+path.sep));return real;}
function load(file,{externalOnly=true,expected=null}={}){
 const real=externalOnly?external(file):fs.realpathSync(file),bytes=fs.readFileSync(real),set=JSON.parse(bytes),catalogs={},bindings=[];
 for(const name of new Set(set.journeys.map(j=>j.catalog))){check(typeof name==='string'&&!path.isAbsolute(name)&&!name.split(/[\\/]/).includes('..'));const p=externalOnly?external(path.resolve(path.dirname(real),name)):path.resolve(path.dirname(real),name);const b=fs.readFileSync(p);catalogs[name]=JSON.parse(b);bindings.push({name,sha256:hash(b.toString('utf8')),value_sha256:hash(catalogs[name])});}
 const counts=validate(set,catalogs),binding={journeys_sha256:hash(bytes.toString('utf8')),journeys_value_sha256:hash(set),catalog_bindings:bindings.sort((a,b)=>a.name.localeCompare(b.name)),...counts};
 if(expected)check(hash(binding)===hash(expected));
 return {set,catalogs,binding,counts};
}
function assertBound(loaded,expected){
 check(!!expected&&hash(loaded.binding)===hash(expected));
 check(hash(loaded.set)===expected.journeys_value_sha256);
 for(const row of expected.catalog_bindings)check(hash(loaded.catalogs[row.name])===row.value_sha256);
 check(hash(validate(loaded.set,loaded.catalogs))===hash(loaded.counts));
}
if(require.main===module){try{process.stdout.write(JSON.stringify(load(process.argv[2]).counts)+'\n');}catch{process.stderr.write('heldout_validation_failed\n');process.exitCode=1;}}
module.exports={validate,load,external,assertBound};
