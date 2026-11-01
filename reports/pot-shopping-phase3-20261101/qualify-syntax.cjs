'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.argv[2]);fs.mkdirSync(out,{recursive:true});
const files=['tests/shopping-model-eval.test.cjs'];
function walk(dir){for(const e of fs.readdirSync(root+'/'+dir,{withFileTypes:true})){const f=dir+'/'+e.name;if(e.isDirectory())walk(f);else if(/\.(cjs|py)$/.test(f))files.push(f);}}
for(const d of ['src/lib/pokemon/shopping/model','tests/shopping/model','reports/pot-shopping-phase3-20261101'])walk(d);
const rows=[];
for(const file of files.sort()){
    const python=file.endsWith('.py');
    const args=python?['-I','-B','-c','import ast,pathlib,sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(),filename=sys.argv[1])',file]:['--check',file];
    const r=cp.spawnSync(python?'python3':process.execPath,args,{cwd:root,env:process.env,encoding:'utf8'});
    const log=r.stdout+'\n'+r.stderr,name=file.replaceAll('/','_')+'.log';fs.writeFileSync(out+'/'+name,log);
    assert.equal(r.status,0,file);assert.ok(!r.signal,file);
    const audits=log.split('\n').flatMap(s=>{try{const a=JSON.parse(s.replace(/^#\s*/,''));return a.strict_network_guard_audit?[a.strict_network_guard_audit]:[];}catch{return [];}});
    if(!python){assert.ok(audits.length>=1,file);assert.ok(audits.every(a=>a.count===0),file);}
    rows.push({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(root+'/'+file)).digest('hex'),exit_code:r.status,language:python?'python':'cjs',node_receipts:audits.length,network_attempts:0});
}
const result={schema:'shopping.phase3.executable-syntax.v1',passed:true,total:rows.length,rows};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2)+'\n');process.stdout.write(JSON.stringify({passed:true,total:rows.length,cjs:rows.filter(r=>r.language==='cjs').length,python:rows.filter(r=>r.language==='python').length})+'\n');
