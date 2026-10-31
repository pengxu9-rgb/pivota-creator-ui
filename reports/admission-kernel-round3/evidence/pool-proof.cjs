'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {subjectValue}=require('./identity-oracle.cjs');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const worker=path.join(__dirname,'pool-proof.py');
const workerHash=()=>crypto.createHash('sha256').update(fs.readFileSync(worker)).digest('hex');
function predicateFor(plan){
  const constraints=plan.constraints,scope={};
  for(const [key,value] of Object.entries(constraints.scope||{})){
    assert.ok(['language','variant','set_code','collector_number'].includes(key),'unsupported admitted pool field');
    if(key==='language')assert.equal(value,constraints.language,'admitted language scope mismatch');else scope[key]=value;
  }
  const subject=subjectValue(constraints.identity);
  if(constraints.identity?.subject)assert.ok(subject,'pool subject must have an independent dex mapping');
  return {languages:constraints.language?[constraints.language]:['ja','en'],scope,identity:{subject:subject?.name??null,form:constraints.identity?.form??null}};
}
function expectedQuery(predicate){
  assert.deepEqual(Object.keys(predicate).sort(),['identity','languages','scope']);
  assert.ok(['["ja"]','["en"]','["ja","en"]'].includes(JSON.stringify(predicate.languages)));
  assert.deepEqual(Object.keys(predicate.identity).sort(),['form','subject']);assert.ok([null,'ex'].includes(predicate.identity.form));
  assert.ok(Object.keys(predicate.scope).every(key=>['set_code','collector_number','variant'].includes(key)));
  assert.ok(Object.values(predicate.scope).every(value=>typeof value==='string'&&value.length>0&&value.length<=80));
  const subject=subjectValue({subject:predicate.identity.subject});if(predicate.identity.subject)assert.ok(subject,'unknown source dex subject');
  let sql=subject?"WITH ids AS MATERIALIZED (SELECT DISTINCT card_id FROM discovery_card_facet WHERE facet_type='dex_id' AND CAST(value AS INTEGER)=?) ":'';
  const parameters=subject?[subject.dexId]:[];
  sql+='SELECT c.card_id,c.language,c.set_code,c.collector_number,c.variant,c.name FROM card c';
  if(subject)sql+=' JOIN ids ON ids.card_id=c.card_id';
  sql+=' WHERE c.language IN ('+predicate.languages.map(()=>'?').join(',')+')';parameters.push(...predicate.languages);
  for(const field of ['set_code','collector_number','variant'])if(Object.hasOwn(predicate.scope,field)){sql+=' AND c.'+field+'=?';parameters.push(predicate.scope[field]);}
  if(predicate.identity.form){sql+=' AND admitted_form_matches(c.name,c.language,?)=1';parameters.push(predicate.identity.form);}
  return {sql:sql+' ORDER BY c.card_id',parameters};
}
function validatePool(pool){
  assert.ok(pool&&Array.isArray(pool.rows)&&Array.isArray(pool.card_ids),'malformed complete pool');
  assert.ok(Number.isSafeInteger(pool.card_count)&&pool.card_count>0,'empty complete pool cannot establish entailment');
  assert.equal(pool.card_count,pool.card_ids.length);assert.equal(pool.rows.length,pool.card_count);
  assert.deepEqual(pool.card_ids,[...new Set(pool.card_ids)].sort(),'pool IDs must be complete sorted unique values');
  assert.deepEqual(pool.rows.map(row=>row.card_id),pool.card_ids);assert.equal(pool.card_ids_sha256,digest(pool.card_ids));
  assert.equal(pool.predicate_sha256,digest(pool.predicate));
  const expected=expectedQuery(pool.predicate);
  assert.equal(pool.sql,expected.sql,'pool SQL must be reconstructed solely from admitted predicates');
  assert.deepEqual(pool.sql_parameters,expected.parameters,'pool SQL parameters must match admitted predicates');
  assert.deepEqual(pool.raw_scope,pool.predicate.scope);assert.deepEqual(pool.normalized_scope,pool.predicate.scope);
  assert.equal(pool.scope_normalization,'exact admitted values; no case, padding or alias expansion');
  assert.equal(pool.sql_sha256,crypto.createHash('sha256').update(pool.sql).digest('hex'));
  assert.ok(Array.isArray(pool.sql_parameters)&&pool.sql.includes('ORDER BY c.card_id'));
  assert.ok(!/\b(?:LIMIT|OFFSET|INSERT|UPDATE|DELETE)\b/i.test(pool.sql),'complete pool query must not rank, paginate or mutate');
  for(const field of ['variant','set_code'])assert.deepEqual(pool.values[field],[...new Set(pool.rows.map(row=>row[field]))].sort());
  for(const row of pool.rows){
    assert.deepEqual(Object.keys(row).sort(),['card_id','collector_number','language','name','set_code','variant']);
    assert.ok(Object.values(row).every(value=>typeof value==='string'&&value.length>0),'pool row needs stored source identity fields');
    assert.ok(pool.predicate.languages.includes(row.language),'pool row outside admitted language');
    for(const [key,value] of Object.entries(pool.predicate.scope))assert.equal(row[key],value,'pool row outside admitted '+key);
    if(pool.predicate.identity.form){const name=row.name.normalize('NFKC').toLowerCase(),form=pool.predicate.identity.form;assert.ok(row.language==='en'?name.endsWith(' '+form)||name.endsWith('-'+form):name.endsWith(form),'pool row outside admitted title form');}
  }
}
// This validates a certificate's structure and predicate binding. Completeness
// comes from the freshly spawned, inspected read-only worker in collectProof,
// not from a self-reported hash or a worker_sha256 label in arbitrary JSON.
function validateProof(proof,{plan,cards,field,observed,provenance,pageSize=5,expectedWorkerHash=workerHash()}={}){
  assert.equal(proof?.schema,'pot.admission.complete-pool-proof.v1');
  assert.ok(['variant','set_code'].includes(field),'pool proof cannot excuse an arbitrary filter');
  assert.equal(proof.worker_sha256,expectedWorkerHash,'pool worker source mismatch');
  for(const key of ['revision','database_sha256','runtime_roster_sha256'])assert.equal(proof.provenance?.[key],provenance[key],'pool/native provenance mismatch: '+key);
  assert.equal(proof.provenance.runtime_source_files_verified,69);assert.equal(proof.provenance.database_mode,'read_only_query_only');assert.equal(proof.python_network_attempts,0);
  assert.equal(Object.keys(proof.provenance.runtime_source_hashes||{}).length,69);
  assert.ok(Number.isSafeInteger(pageSize)&&pageSize>0);
  const predicate=predicateFor(plan);assert.deepEqual(proof.predicate,predicate,'proof must bind every admitted catalog predicate');
  assert.equal(proof.predicate_sha256,digest(predicate));assert.deepEqual(proof.pool.predicate,predicate);validatePool(proof.pool);
  assert.deepEqual(proof.pool.values[field],[observed],'full eligible pool does not entail observed value');
  const ids=cards.map(card=>card.card_id),poolIds=new Set(proof.pool.card_ids);
  assert.ok(ids.length>0&&new Set(ids).size===ids.length,'observed candidates must be nonempty and unique');
  for(const card of cards){
    assert.ok(poolIds.has(card.card_id),'candidate outside complete pool: '+card.card_id);
    const source=proof.pool.rows.find(row=>row.card_id===card.card_id);
    for(const key of ['language','variant','set_code','collector_number','name'])assert.equal(card[key],source[key],'candidate differs from source pool: '+key);
  }
  if(proof.pool.card_count<=pageSize)assert.deepEqual([...ids].sort(),proof.pool.card_ids,'a complete pool fitting one page must be returned in full');
  // Removing an admitted filter is a separate predicate, never authority for
  // the original query. Persist the counterfactual even when it is broad.
  assert.ok(Array.isArray(proof.counterfactuals));
  assert.deepEqual(proof.counterfactuals.map(row=>row.omitted).sort(),Object.keys(predicate.scope).sort(),'each admitted scope filter needs its removal counterfactual');
  for(const counter of proof.counterfactuals){
    const expected=structuredClone(predicate);assert.ok(Object.hasOwn(expected.scope,counter.omitted));delete expected.scope[counter.omitted];
    assert.deepEqual(counter.predicate,expected);validatePool(counter);
    const broaderIds=new Set(counter.card_ids);assert.ok(proof.pool.card_ids.every(id=>broaderIds.has(id)),'counterfactual must contain original pool');
  }
  return {status:'entailed_by_complete_catalog_pool',explicitly_admitted:false,field,observed,predicate,pool_count:proof.pool.card_count,pool_card_ids:proof.pool.card_ids,pool_card_ids_sha256:proof.pool.card_ids_sha256,worker_sha256:proof.worker_sha256,database_sha256:proof.provenance.database_sha256};
}
async function collectProof(plan,{task}={}){
  assert.match(process.env.NODE_OPTIONS||'',/strict-network-guard\.cjs/);
  assert.equal(task,'character_cards','full-pool worker is qualified only for the ordinary character route');
  assert.equal(plan.action.type,'ask');assert.ok(!/\b(?:recommend|suggest)\b/i.test(plan.action.question),'recommendation pools require a different proof');
  assert.ok(subjectValue(plan.constraints.identity),'ordinary character pool requires a known admitted subject');
  const request={schema:'pot.admission.pool-request.v1',predicate:predicateFor(plan)};
  return new Promise((resolve,reject)=>{
    const child=spawn('python3',['-B',worker],{env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';
    child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.once('error',reject);
    child.once('close',code=>{try{
      const audit=stderr.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).find(row=>Number.isInteger(row?.python_network_attempts));
      assert.equal(code,0,'pool proof worker failed: '+stderr);assert.equal(audit?.python_network_attempts,0,'pool worker network audit missing or nonzero');
      const proof=JSON.parse(stdout);assert.equal(proof.worker_sha256,workerHash());resolve({proof,audit:{exit_code:code,python_network_attempts:audit.python_network_attempts,worker_sha256:proof.worker_sha256,stderr}});
    }catch(error){reject(error);}});child.stdin.end(JSON.stringify(request));
  });
}
module.exports={predicateFor,expectedQuery,validateProof,validatePool,collectProof,digest,workerHash};
