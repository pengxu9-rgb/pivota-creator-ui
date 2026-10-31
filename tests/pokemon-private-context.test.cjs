'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('private gateway closure loads from only the composed creator/cloud paths with providers off',t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'pot-private-closure-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  fs.cpSync(path.join(root,'src/lib/pokemon'),path.join(directory,'creator/src/lib/pokemon'),{recursive:true});
  fs.cpSync(path.join(root,'cloud/pokemon/runtime'),path.join(directory,'cloud'),{recursive:true});
  const result=spawnSync(process.execPath,['-e',"const assert=require('node:assert/strict');const c=require(process.argv[1]);assert.equal(c.configuration({}),null);require(process.argv[2]).validateOffer(require(process.argv[3]).offers[0]);",path.join(directory,'cloud/commerce-sidecar.cjs'),path.join(directory,'creator/src/lib/pokemon/commerceContract.cjs'),path.join(root,'tests/fixtures/official-ebay-research.offline.json')],{encoding:'utf8',env:{PATH:process.env.PATH,NODE_PATH:'',NODE_OPTIONS:process.env.NODE_OPTIONS}});
  assert.equal(result.status,0,result.stderr);
  // Keep the inherited child's network audit visible to the evidence runner.
  if(result.stderr)process.stderr.write(result.stderr);
});
test('context composer includes only reviewed build/runtime files and omits secrets/operator fixtures',()=>{
  const program=String.raw`
import importlib.util,pathlib,json
spec=importlib.util.spec_from_file_location('composer',pathlib.Path('cloud/pokemon/compose.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
fe={p:b'fixture' for p in m.BUILD_FILES}
fe.update({'cloud/pokemon/runtime/'+p:b'fixture' for p in m.RUNTIME})
fe.update({'cloud/pokemon/Dockerfile':b'fixture','src/lib/pokemon/purchaseLink.cjs':b'fixture','src/lib/pokemon/commerceContract.cjs':b'fixture','src/lib/pokemon/cloudTestScope.cjs':b'fixture','public/icon.png':b'fixture','.env.local':b'private','operator/oauth.json':b'private','tests/private.json':b'private'})
fe.update({'private-coverage/snapshot.json':b'neutral','private-coverage/snapshot.sha256':b'hash','private-coverage/operator.json':b'private'})
be={p:b'fixture' for p in ['pokemon_index/commerce_service.py','pokemon_index/commerce_loop.py','pokemon_index/ebay_official.py']};be.update({'tests/token.json':b'private','.env':b'private'})
result=m.context_files(fe,be)
assert result['creator/public/icon.png']==b'fixture'
assert result['private-coverage/snapshot.json']==b'neutral'
assert not any(p.startswith('creator/public/') and 'coverage' in p for p in result)
assert not any(v==b'private' for v in result.values())
try:m.context_files({k:v for k,v in fe.items() if not k.endswith('purchaseLink.cjs')},be)
except ValueError:pass
else:raise AssertionError('missing required helper accepted')
try:m.context_files(fe,be|{'pokemon_index/../../.env':b'private'})
except ValueError:pass
else:raise AssertionError('unsafe archive path accepted')
print(json.dumps({'safe':True,'files':len(result)}))
`;
  const result=spawnSync('python3',['-I','-B','-c',program],{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,NODE_OPTIONS:process.env.NODE_OPTIONS}});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).safe,true);
});
