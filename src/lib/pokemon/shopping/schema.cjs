'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
class ShoppingError extends Error{constructor(code,retry='none'){super(code);this.code=code;this.retry_class=retry;}}
const fail=(code,retry)=>{throw new ShoppingError(code,retry);};
const copy=v=>structuredClone(v);
function stable(v){if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}';return JSON.stringify(v);}
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'?v:stable(v)).digest('hex');
const directory=path.join(__dirname,'contracts'),files=fs.readdirSync(directory).filter(f=>f.endsWith('.schema.json')).sort(),schemas=Object.fromEntries(files.map(f=>[f,JSON.parse(fs.readFileSync(path.join(directory,f),'utf8'))]));
function resolve(s,file){if(!s.$ref)return {s,file};const [target,fragment='']=s.$ref.split('#'),next=target||file;if(!Object.hasOwn(schemas,next))fail('invalid_schema_reference');let value=schemas[next];for(const part of fragment.split('/').filter(Boolean))value=value?.[part.replaceAll('~1','/').replaceAll('~0','~')];if(!value)fail('invalid_schema_reference');return {s:value,file:next};}
function conforms(value,s,file){
 if(s.$ref){const next=resolve(s,file);return conforms(value,next.s,next.file);}
 if(s.anyOf)return s.anyOf.some(x=>conforms(value,x,file));
 if(s.oneOf)return s.oneOf.filter(x=>conforms(value,x,file)).length===1;
 if(Object.hasOwn(s,'const')&&stable(value)!==stable(s.const))return false;
 if(s.enum&&!s.enum.some(x=>stable(x)===stable(value)))return false;
 if(s.type==='null')return value===null;
 if(s.type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  if((s.required||[]).some(k=>!Object.hasOwn(value,k)))return false;
  if(s.additionalProperties===false&&Object.keys(value).some(k=>!Object.hasOwn(s.properties||{},k)))return false;
  return Object.entries(s.properties||{}).every(([k,rule])=>!Object.hasOwn(value,k)||conforms(value[k],rule,file));
 }
 if(s.type==='array')return Array.isArray(value)&&(s.maxItems===undefined||value.length<=s.maxItems)&&(s.minItems===undefined||value.length>=s.minItems)&&value.every(x=>conforms(x,s.items,file));
 if(s.type==='string')return typeof value==='string'&&(s.minLength===undefined||value.length>=s.minLength)&&(s.maxLength===undefined||value.length<=s.maxLength)&&(!s.pattern||new RegExp(s.pattern,'u').test(value));
 if(s.type==='integer')return Number.isSafeInteger(value)&&(s.minimum===undefined||value>=s.minimum)&&(s.maximum===undefined||value<=s.maximum);
 if(s.type==='boolean')return typeof value==='boolean';
 return true;
}
const tools=Object.fromEntries(files.filter(f=>f!=='common.schema.json').map(f=>[schemas[f]['x-tool-name'],schemas[f]]));
function validateRequest(name,args){const s=tools[name];if(!s||!conforms(args,s,name+'.schema.json'))fail('invalid_request');return copy(args);}
function validateRecord(record){if(!conforms(record,schemas['common.schema.json'].$defs.record,'common.schema.json'))fail('invalid_evidence');return record;}
function validateEnvelope(value){if(!conforms(value,schemas['common.schema.json'].$defs.envelope,'common.schema.json'))fail('invalid_tool_result');return value;}
function inline(s,file){if(s.$ref){const x=resolve(s,file);return inline(x.s,x.file);}if(Array.isArray(s))return s.map(x=>inline(x,file));if(s&&typeof s==='object')return Object.fromEntries(Object.entries(s).filter(([k])=>!k.startsWith('x-')&&!['$id','$schema','title'].includes(k)).map(([k,v])=>[k,inline(v,file)]));return s;}
const declarations=()=>Object.values(tools).filter(s=>s['x-model-callable']).map(s=>({name:s['x-tool-name'],description:s.description||s['x-tool-name'],parameters:inline(s,s['x-tool-name']+'.schema.json')}));
function semantic(args){return Object.fromEntries(Object.entries(args).filter(([k])=>!['request_id','expected_version','cancellation_epoch','human_action_ref'].includes(k)));}
function errorShape(error,version=0,operation_ref=null){return {code:error instanceof ShoppingError?error.code:'internal_error',operation_ref,retry_class:error instanceof ShoppingError?error.retry_class:'none',field_refs:[],current_version:version,evidence_refs:[]};}
function issuer(){const members=new WeakMap();return {issue(scope,role){const p=Object.freeze({});members.set(p,Object.freeze({...scope,role}));return p;},meta(p){const m=p&&members.get(p);if(!m)fail('principal_denied');return m;}};}
module.exports={ShoppingError,fail,copy,stable,hash,tools,declarations,validateRequest,validateRecord,validateEnvelope,semantic,errorShape,issuer,conforms,schemas};
