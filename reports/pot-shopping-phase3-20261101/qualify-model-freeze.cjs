'use strict';
const fs=require('node:fs'),cp=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const {hash}=require('../../src/lib/pokemon/shopping/schema.cjs');
const ROOT=path.resolve(__dirname,'../..'),BASE='12dc3a19299c19e200541c4261a69658c26a1b72';
function qualify(){
 const files=['src/lib/pokemon/shopping/model/turn.cjs','src/lib/pokemon/shopping/model/declarations.cjs','reports/pot-shopping-phase3-20261101/declarations.json','src/lib/pokemon/shopping/model/context.cjs'];
 const rows=files.map(file=>{const before=cp.execFileSync('git',['show',BASE+':'+file],{cwd:ROOT}),after=fs.readFileSync(ROOT+'/'+file);assert.ok(before.equals(after),'frozen model file changed: '+file);return {file,sha256:hash(after.toString('utf8'))};});
 const old=JSON.parse(cp.execFileSync('git',['show',BASE+':reports/pot-shopping-phase3-20261101/freeze.json'],{cwd:ROOT,encoding:'utf8'}));
 assert.deepEqual(require('./freeze.json').generationConfig,old.generationConfig);assert.deepEqual(require('../../src/lib/pokemon/shopping/model/turn.cjs').CONFIG,old.generationConfig);
 return {passed:true,base:BASE,byte_identical:rows,generation_config_identical:true};
}
if(require.main===module){const r=qualify();if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(r,null,2)+'\n');process.stdout.write(JSON.stringify(r)+'\n');}
module.exports={qualify};
