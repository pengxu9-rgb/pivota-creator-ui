'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const vocabulary=require('../src/lib/pokemon/admissionVocabulary.json');
const provenance=require('../reports/admission-kernel-round2/evidence/admission-vocabulary-provenance.json');
const ROOT=path.resolve(__dirname,'..');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('admission vocabulary is bound to its generator and pinned read-only sources',()=>{
  assert.equal(vocabulary.database_sha256,'a72ba074fdf13f426b5709f67926e631ad32f52e92d08ff3e1ab646ed3b8f204');
  assert.equal(vocabulary.generation.script_sha256,hash(path.join(ROOT,vocabulary.generation.script)));
  assert.equal(provenance.output_sha256,hash(path.join(ROOT,'src/lib/pokemon/admissionVocabulary.json')));
  assert.equal(provenance.database_sha256_before,provenance.database_sha256_after);
  assert.equal(Object.keys(provenance.runtime_source_hashes).length,69);
  assert.equal(provenance.python_network_attempts,0);
  assert.equal(provenance.node_network_attempts,0);
  assert.deepEqual(vocabulary.source_counts.catalog_vocabulary_alias_kinds,{printed_code:21,set_name:21});
  assert.equal(vocabulary.source_counts.catalog_set_localized_rows,418);
  assert.equal(vocabulary.source_counts.catalog_set_localized_nonempty_names,416);
  assert.equal(vocabulary.source_counts.catalog_vocabulary_rows,42);
  assert.equal(vocabulary.source_counts.collector_release_alias_records,1);
});

test('release aliases preserve native source spellings, alphabetic codes and ambiguous targets',()=>{
  const aliases=new Map(vocabulary.releases.map(row=>[row.alias,row]));
  assert.equal(aliases.size,vocabulary.source_counts.unique_normalized_release_aliases);
  assert.deepEqual(aliases.get('base set').targets,[{language:'en',set_code:'BASE1'}]);
  assert.deepEqual(aliases.get('fossil').targets,[{language:'en',set_code:'BASE3'}]);
  assert.deepEqual(aliases.get('shiny treasure ex').targets,[{language:'ja',set_code:'SV4A'}]);
  assert.deepEqual(aliases.get('シャイニートレジャーex').targets,[{language:'ja',set_code:'SV4A'}]);
  assert.deepEqual(aliases.get('si').targets,[{language:'ja',set_code:'SI'}]);
  assert.deepEqual(aliases.get('151').targets,[{language:'en',set_code:'SV03.5'},{language:'ja',set_code:'SV2A'}]);
  assert.deepEqual(aliases.get('pokémon go').targets,[{language:'en',set_code:'SWSH10.5'},{language:'ja',set_code:'S10B'}]);
  assert.equal(aliases.has('charizard'),false,'a character name is not a release-domain alias');
});

test('finish vocabulary covers every native ask and reply spelling without equating the reverse family to one exact variant',()=>{
  const finishes=new Map(vocabulary.finishes.map(row=>[row.alias,row]));
  for(const [alias,variant] of Object.entries({normal:'normal','non-holo':'normal','nonfoil':'normal','ノンホロ':'normal',holo:'holo',holographic:'holo',foil:'holo','ホロ':'holo','master ball':'reverse_masterball','master ball reverse':'reverse_masterball','マスターボール':'reverse_masterball','大师球':'reverse_masterball','poké ball':'reverse_pokeball','poke ball reverse':'reverse_pokeball','モンスターボール':'reverse_pokeball','精灵球':'reverse_pokeball'})){
    assert.equal(finishes.get(alias)?.variant,variant,alias);
    assert.equal(finishes.get(alias)?.kind,'exact',alias);
  }
  for(const alias of ['reverse','ミラー'])assert.deepEqual({variant:finishes.get(alias)?.variant,kind:finishes.get(alias)?.kind},{variant:'reverse',kind:'prefix'});
  const rules=vocabulary.finish_rules.map(rule=>({...rule,regex:new RegExp(rule.pattern,'gu')}));
  for(const finish of vocabulary.finishes)assert.ok(rules.some(rule=>rule.variant===finish.variant&&rule.kind===finish.kind&&new RegExp(rule.pattern,'u').test(finish.alias)),finish.alias+' is absent from native rules');
  assert.ok(rules.some(rule=>new RegExp(rule.pattern,'u').test('master   ball')),'native whitespace grammar must be retained');
  for(const word of ["don't",'don’t','other than','anything but','以外','含めない','不要','不包含'])assert.ok(vocabulary.negated_taste.includes(word),word);
});

test('generated Unicode overrides cover casefold expansions and scripts whose default fold preserves uppercase',()=>{
  const fold=text=>Array.from(text.normalize('NFKC')).map(character=>vocabulary.casefoldOverrides[character]??character.toLowerCase()).join('');
  assert.equal(fold('Foßil'),'fossil');
  assert.equal(fold('ＦＯＳＳＩＬ'),'fossil');
  assert.equal(fold('Σσς'),'σσσ');
  assert.equal(fold('Ꭰꭰ'),'ᎠᎠ');
  assert.equal(fold('İ'),'i\u0307');
  for(const row of vocabulary.releases)assert.equal(fold(row.alias),row.alias,row.alias);
});

test('native whitespace parity detects ball variants before every negated ask can reach native',()=>{
  const {admit,extractSignals}=require('../src/lib/pokemon/admission.cjs');
  const nativeWhitespace=new RegExp('^'+vocabulary.native_whitespace_regex+'$','u');
  assert.equal(vocabulary.native_whitespace_codepoints.length,29);
  for(const code of [0x1c,0x1d,0x1e,0x1f,0x85]){
    assert.ok(vocabulary.native_whitespace_codepoints.includes(code));
    assert.equal(/\s/u.test(String.fromCodePoint(code)),false,'the regression must exercise whitespace missing from JS');
  }
  const binding={owner:'vocabulary-owner',chatId:'vocabulary-chat',stateVersion:1,workspaceId:null,workspaceVersion:null,deadline:30000};
  for(const code of vocabulary.native_whitespace_codepoints){
    const whitespace=String.fromCodePoint(code);assert.equal(nativeWhitespace.test(whitespace),true);
    for(const word of ['master','poke','poké']){
      const text='Find Pikachu cards without '+word+whitespace+'ball',normalized=text.normalize('NFKC');
      assert.ok(extractSignals(normalized).finishes.length,'missing native finish for U+'+code.toString(16)+' '+word);
      const plan=admit({candidate:{action:{type:'ask',question:text}},text,ingress:'typed',binding,now:()=>1000});
      assert.ok(plan.hold,'negated native finish escaped for U+'+code.toString(16)+' '+word);
      assert.equal(plan.localOnly,true);
    }
  }
});
