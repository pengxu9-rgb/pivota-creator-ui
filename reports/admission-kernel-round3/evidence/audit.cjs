'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../../..'),OUT=path.resolve(__dirname,'..');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(directory){return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(directory,e.name)):[path.join(directory,e.name)]);}
const sourceHashes=()=>Object.fromEntries(files(path.join(ROOT,'src')).filter(f=>/\.(?:ts|tsx|cjs|json)$/.test(f)).map(f=>[path.relative(ROOT,f),hash(f)]));
const testHashes=()=>Object.fromEntries(files(path.join(ROOT,'tests')).filter(f=>/\.(?:cjs|json)$/.test(f)).map(f=>[path.relative(ROOT,f),hash(f)]));
const evidenceHashes=()=>Object.fromEntries([...files(__dirname),...files(path.join(ROOT,'reports/admission-kernel-round2/evidence')),path.join(ROOT,'reports/admission-kernel/evidence/corpus.cjs'),path.join(ROOT,'reports/admission-kernel/evidence/native-worker.py'),path.join(ROOT,'reports/admission-kernel-round2/clarification-rate.json')].filter(f=>/\.(?:cjs|py|json)$/.test(f)).map(f=>[path.relative(ROOT,f),hash(f)]));
const git=(...args)=>execFileSync('git',args,{cwd:ROOT,encoding:'utf8'}).trim();
function startAudit(filename){return {source_head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),source_hashes:sourceHashes(),test_hashes:testHashes(),evidence_input_hashes:evidenceHashes(),harness_sha256:hash(filename),strict_network_guard_sha256:hash(path.join(ROOT,'tests/helpers/strict-network-guard.cjs')),node_options:process.env.NODE_OPTIONS||null};}
function finishAudit(audit){return {...audit,source_head_after:git('rev-parse','HEAD'),source_hashes_unchanged:JSON.stringify(sourceHashes())===JSON.stringify(audit.source_hashes),test_hashes_unchanged:JSON.stringify(testHashes())===JSON.stringify(audit.test_hashes),evidence_inputs_unchanged:JSON.stringify(evidenceHashes())===JSON.stringify(audit.evidence_input_hashes),source_head_unchanged:git('rev-parse','HEAD')===audit.source_head};}
function write(name,value){fs.writeFileSync(path.join(OUT,name),JSON.stringify(value,null,2)+'\n');}
module.exports={ROOT,OUT,hash,startAudit,finishAudit,write};
