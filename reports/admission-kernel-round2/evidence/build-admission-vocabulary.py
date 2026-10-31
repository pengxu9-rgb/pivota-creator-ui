"""Generate the admission vocabulary from pinned, read-only local sources."""
import ast
import atexit
from collections import Counter, defaultdict
import hashlib
import json
import os
import pathlib
import re
import socket
import sqlite3
import subprocess
import sys
import unicodedata

ATTEMPTS = []
def deny_network(*args, **kwargs):
    ATTEMPTS.append('socket_or_dns')
    raise RuntimeError('offline_network_denied')
for name in ('connect', 'connect_ex', 'bind', 'listen', 'sendto', 'sendmsg'):
    if hasattr(socket.socket, name):
        setattr(socket.socket, name, deny_network)
for name in ('create_connection', 'getaddrinfo', 'gethostbyname', 'gethostbyname_ex', 'gethostbyaddr', 'getnameinfo'):
    if hasattr(socket, name):
        setattr(socket, name, deny_network)
atexit.register(lambda: print(json.dumps({'python_network_attempts': len(ATTEMPTS)}), file=sys.stderr, flush=True))
ROOT = pathlib.Path(__file__).resolve().parents[3]
GUARD = str(ROOT / 'tests/helpers/strict-network-guard.cjs')
assert '--require=' + GUARD in os.environ.get('NODE_OPTIONS', ''), 'NODE_OPTIONS strict guard required'
BASE = pathlib.Path(os.environ['ADMISSION_NATIVE_ROOT']).resolve(strict=True)
DB = BASE / 'batch-v1/catalog.sqlite3'
DB_HASH = 'a72ba074fdf13f426b5709f67926e631ad32f52e92d08ff3e1ab646ed3b8f204'
ROSTER = BASE / 'build-context-v2/payload/runtime-roster.json'
RUNTIME = BASE / 'runtime-candidate'
OUTPUT = ROOT / 'src/lib/pokemon/admissionVocabulary.json'
PROVENANCE = pathlib.Path(__file__).with_name('admission-vocabulary-provenance.json')
def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()
assert sha256(DB) == DB_HASH, 'database hash mismatch'
roster = json.loads(ROSTER.read_text())
assert len(roster['source_files']) == 69
for name, expected in roster['source_files'].items():
    assert name.startswith('pokemon_index/') and '..' not in pathlib.Path(name).parts
    assert sha256(RUNTIME / name) == expected, 'runtime hash mismatch: ' + name

def normalize(value):
    return unicodedata.normalize('NFKC', value).casefold()

def native_finish_rules():
    """Read expressions as data with ast; never import or modify native modules."""
    recommendation = ast.parse((RUNTIME / 'pokemon_index/collector_recommendation.py').read_text())
    discovery = ast.parse((RUNTIME / 'pokemon_index/collector_discovery.py').read_text())
    journey = ast.parse((RUNTIME / 'pokemon_index/collector_journey.py').read_text())
    question = next(n for n in recommendation.body if isinstance(n, ast.FunctionDef) and n.name == 'question_constraints')
    loop = next(n for n in ast.walk(question) if isinstance(n, ast.For) and isinstance(n.target, ast.Tuple)
                and [t.id for t in n.target.elts] == ['pattern', 'variant'])
    rules = [dict(source='collector_recommendation.question_constraints', pattern=pattern,
                  variant=variant, kind='exact', priority=i, source_line=loop.lineno)
             for i, (pattern, variant) in enumerate(ast.literal_eval(loop.iter))]
    finish = next(n for n in discovery.body if isinstance(n, ast.FunctionDef) and n.name == '_finish_result')
    discovery_rules = []
    for node in ast.walk(finish):
        if not isinstance(node, ast.If) or not isinstance(node.test, ast.Call):
            continue
        call = node.test
        if not isinstance(call.func, ast.Attribute) or not isinstance(call.func.value, ast.Name):
            continue
        if (call.func.value.id, call.func.attr) != ('re', 'search'):
            continue
        assignments = [n for n in node.body if isinstance(n, ast.Assign)
                       and any(isinstance(t, ast.Name) and t.id == 'finish' for t in n.targets)]
        if not assignments:
            continue
        value = assignments[0].value
        if isinstance(value, ast.Set):
            variant, = ast.literal_eval(value)
            kind = 'exact'
        else:
            # Native reverse is a family, rather than the exact "reverse" value.
            assert isinstance(value, ast.SetComp)
            assert ast.unparse(value.generators[0].ifs[0]) == "r['variant'].startswith('reverse')"
            variant, kind = 'reverse', 'prefix'
        discovery_rules.append(dict(source='collector_discovery._finish_result',
                                    pattern=ast.literal_eval(call.args[0]), variant=variant,
                                    kind=kind, source_line=node.lineno))
    for i, rule in enumerate(sorted(discovery_rules, key=lambda r: r['source_line'])):
        rules.append(dict(rule, priority=i))
    negative = next(n for n in recommendation.body if isinstance(n, ast.Assign)
                    and any(isinstance(t, ast.Name) and t.id == 'NEGATED_TASTE' for t in n.targets))
    negative_pattern = ast.literal_eval(negative.value)
    # The pinned grammar has finite vocabulary; assert it before enumerating so
    # a future pattern change cannot silently produce an incomplete detector.
    expected_negative = (r"\b(?:not|without|avoid|exclude|excluding|except|dislike|hate|never)\b|"
                         r"\bother\s+than\b|\b(?:anything|everything|anyone)\s+but\b|"
                         r"\b(?:don['’]t|do not|no)\b|嫌い|苦手|以外|除外|含めない|いらない|"
                         r"好きではない|好きじゃない|不喜欢|不喜歡|不要|排除|不想|不包含")
    assert negative_pattern == expected_negative
    negated = ['not', 'without', 'avoid', 'exclude', 'excluding', 'except', 'dislike', 'hate', 'never',
               'other than', 'anything but', 'everything but', 'anyone but', "don't", 'don’t', 'do not', 'no',
               '嫌い', '苦手', '以外', '除外', '含めない', 'いらない', '好きではない', '好きじゃない',
               '不喜欢', '不喜歡', '不要', '排除', '不想', '不包含']
    assert all(re.fullmatch(negative_pattern, word) for word in negated)
    variants = {
        'normal': ['nonholo', 'non holo', 'non-holo', 'ノンホロ', 'nonfoil', 'non foil', 'non-foil'],
        'reverse_masterball': ['masterball', 'master ball', 'マスターボール', '大师球'],
        'reverse_pokeball': ['pokeball', 'poke ball', 'pokéball', 'poké ball', 'モンスターボール', '精灵球'],
        'holo': ['holo', 'holographic', 'ホロ', 'foil'],
        'reverse': ['reverse', 'ミラー'],
    }
    aliases = []
    for variant, words in variants.items():
        for word in words:
            matches = [r for r in rules if r['variant'] == variant and re.fullmatch(r['pattern'], word)]
            assert matches, 'finish alias has no native grammar: ' + word
            aliases.append(dict(alias=normalize(word), variant=variant,
                                kind='prefix' if variant == 'reverse' else 'exact',
                                sources=sorted({r['source'] for r in matches})))
    reply = next(n for n in journey.body if isinstance(n, ast.FunctionDef) and n.name == '_reply_scope')
    reply_variants = next(n for n in reply.body if isinstance(n, ast.Assign)
                          and any(isinstance(t, ast.Name) and t.id == 'variants' for t in n.targets))
    for priority, (word, variant) in enumerate(ast.literal_eval(reply_variants.value).items()):
        word = normalize(word)
        existing = next((a for a in aliases if a['alias'] == word), None)
        if existing:
            assert existing['variant'] == variant and existing['kind'] == 'exact'
            existing['sources'].append('collector_journey._reply_scope')
            existing['sources'].sort()
        else:
            aliases.append(dict(alias=word, variant=variant, kind='exact', sources=['collector_journey._reply_scope']))
        # Escape regex metacharacters only; Python re.escape also escapes spaces
        # and hyphens, which are invalid identity escapes in JS Unicode regexes.
        pattern = ''.join('\\' + c if c in '\\^$.*+?()[]{}|' else c for c in word)
        if re.fullmatch(r"[a-z0-9 '\-\.]+", word):
            pattern = r'(?<![a-z0-9])' + pattern + r'(?![a-z0-9])'
        rules.append(dict(source='collector_journey._reply_scope', pattern=pattern,
                          variant=variant, kind='exact', priority=priority, source_line=reply_variants.lineno))
    # Every native rule is represented, including the discovery-only extensions.
    assert all(any(re.fullmatch(r['pattern'], a['alias']) for a in aliases) for r in rules)
    return rules, sorted(aliases, key=lambda a: a['alias']), negated, negative_pattern

def javascript_casefold_overrides():
    # Compare to the actual guarded JS runtime, not Python.lower(): the two
    # runtimes may use different Unicode releases (currently 16 and 17).
    javascript = r"""
const guard=require(process.argv[1]);
const lowered={};
for(let code=0;code<=0x10ffff;code++){
  const character=String.fromCodePoint(code),lower=character.toLowerCase();
  if(lower!==character)lowered[character]=lower;
}
if(guard.attempts.length)throw Error('unexpected_network_attempt');
process.stdout.write(JSON.stringify({lowered,node_version:process.version,unicode_version:process.versions.unicode,node_network_attempts:guard.attempts.length}));
"""
    child = subprocess.run(['node', '-e', javascript, GUARD], check=True, capture_output=True, text=True)
    javascript_lower = json.loads(child.stdout)
    audits = [json.loads(line)['strict_network_guard_audit'] for line in child.stderr.splitlines()
              if 'strict_network_guard_audit' in line]
    assert len(audits) == 1 and audits[0]['count'] == 0
    overrides = {chr(code): chr(code).casefold() for code in range(sys.maxunicode + 1)
                 if chr(code).casefold() != javascript_lower['lowered'].get(chr(code), chr(code))}
    metadata = {key: javascript_lower[key] for key in ('node_version', 'unicode_version', 'node_network_attempts')}
    return overrides, metadata

def reviewed_release_aliases(db):
    # Same local binding checks as collector_release_alias.aliases, without
    # importing any native module or a provider client.
    source = RUNTIME / 'pokemon_index/collector-release-name-aliases-v1.json'
    payload = json.loads(source.read_text())
    assert payload['schema'] == 'pokemon.reviewed-release-name-aliases.v1'
    rows = []
    for binding in payload['records']:
        assert binding['schema'] == 'pokemon.reviewed-release-name-alias.v1'
        assert binding['source_published_alias'] is False
        assert binding['derivation'] == 'reviewed_english_rendering_of_exact_official_japanese_title.v1'
        scope = (binding['language'], binding['set_code'])
        current = db.execute('SELECT * FROM catalog_set_localized WHERE language=? AND set_code=?', scope).fetchone()
        saved = db.execute('SELECT evidence_json FROM catalog_release_evidence WHERE language=? AND set_code=?', scope).fetchone()
        assert current is not None and dict(current) == binding['current_release']
        assert saved is not None and json.loads(saved[0]) == binding['release_evidence']
        rows.append(binding)
    return rows

def generate(db):
    sets = [dict(r) for r in db.execute('SELECT language,set_code,name FROM catalog_set_localized ORDER BY language,set_code')]
    vocabulary = [dict(r) for r in db.execute('SELECT language,set_code,alias,alias_kind FROM catalog_vocabulary ORDER BY language,set_code,alias')]
    # Native uses all card set codes too, including alphabetic codes that the
    # old [A-Z]+digit signal could not cover.
    codes = [dict(r) for r in db.execute('SELECT DISTINCT language,set_code FROM card ORDER BY language,set_code')]
    reviewed = reviewed_release_aliases(db)
    releases = defaultdict(lambda: dict(targets=set(), sources=set()))
    def add(alias, language, code, source):
        alias = normalize(alias)
        assert alias and language in {'en', 'ja'} and code
        releases[alias]['targets'].add((language, code))
        releases[alias]['sources'].add(source)
    for row in sets:
        if row['name']:
            add(row['name'], row['language'], row['set_code'], 'catalog_set_localized.name')
    for row in vocabulary:
        assert row['alias_kind'] in {'set_name', 'printed_code'}
        add(row['alias'], row['language'], row['set_code'], 'catalog_vocabulary.' + row['alias_kind'])
        short = re.fullmatch(r'ポケモンカード(\d+)', row['alias'])
        if short:
            add(short[1], row['language'], row['set_code'], 'native_numeric_product_shorthand')
    for row in reviewed:
        add(row['alias'], row['language'], row['set_code'], 'collector_release_alias')
    for row in codes:
        add(row['set_code'], row['language'], row['set_code'], 'native_set_code')
    rules, finishes, negated, negative_pattern = native_finish_rules()
    overrides, javascript_casefold = javascript_casefold_overrides()
    # Native regexes use Python's Unicode whitespace, which includes U+001C
    # through U+001F and U+0085 omitted by JavaScript's \s. Export an exact
    # portable class instead of silently changing the grammar across runtimes.
    whitespace = [code for code in range(sys.maxunicode + 1) if re.fullmatch(r'\s', chr(code))]
    assert all(code <= 0xffff for code in whitespace)
    whitespace_regex = '[' + ''.join('\\u' + format(code, '04x') for code in whitespace) + ']'
    counts = dict(catalog_set_localized_rows=len(sets),
                  catalog_set_localized_nonempty_names=sum(bool(r['name']) for r in sets),
                  catalog_vocabulary_rows=len(vocabulary),
                  catalog_vocabulary_alias_kinds=dict(sorted(Counter(r['alias_kind'] for r in vocabulary).items())),
                  collector_release_alias_records=len(reviewed),
                  native_set_code_language_pairs=len(codes),
                  unique_normalized_release_aliases=len(releases),
                  finish_aliases=len(finishes), native_finish_rules=len(rules),
                  negated_taste_aliases=len(negated), casefold_overrides=len(overrides),
                  native_whitespace_codepoints=len(whitespace))
    result = dict(schema='pokemon.admission-vocabulary.v1', database_sha256=DB_HASH,
                  normalization=dict(form='NFKC', casefold='Unicode default casefold',
                                     unicode_version=unicodedata.unidata_version),
                  generation=dict(script='reports/admission-kernel-round2/evidence/build-admission-vocabulary.py',
                                  script_sha256=sha256(pathlib.Path(__file__)),
                                  command='NODE_OPTIONS=--require="$PWD/tests/helpers/strict-network-guard.cjs" python3 -B reports/admission-kernel-round2/evidence/build-admission-vocabulary.py',
                                  database='<native>/batch-v1/catalog.sqlite3', database_mode='read_only_query_only',
                                  runtime_roster_sha256=sha256(ROSTER), runtime_source_files_verified=69,
                                  javascript_casefold_basis=javascript_casefold,
                                  reproducible=True), source_counts=counts,
                  casefoldOverrides=overrides,
                  native_whitespace_regex=whitespace_regex,
                  native_whitespace_codepoints=whitespace,
                  releases=[dict(alias=alias,
                                 targets=[dict(language=language, set_code=code) for language, code in sorted(facts['targets'])],
                                 sources=sorted(facts['sources'])) for alias, facts in sorted(releases.items())],
                  finishes=finishes, finish_rules=rules, negated_taste=negated,
                  negated_taste_pattern=negative_pattern)
    provenance = dict(schema='pokemon.admission-vocabulary-provenance.v1', passed=True,
                      database_sha256_before=DB_HASH, database_sha256_after=sha256(DB),
                      database_mode='read_only_query_only', runtime_source_files_verified=69,
                      runtime_roster_sha256=sha256(ROSTER),
                      runtime_source_hashes=roster['source_files'], source_counts=counts,
                      generation=result['generation'],
                      scope='Static detector vocabulary only. Exact positive grammars must still admit each constraint; negated_taste only triggers a hold.',
                      notes=[
                          'catalog_vocabulary schema restricts alias_kind to set_name or printed_code; no card-name domain is exported as a release.',
                          'collector_release_alias is a verified module and source JSON, not a SQLite table. Every binding passed the native localized-release and evidence equality checks.',
                          'All localized names and vocabulary aliases are retained after NFKC+casefold, with targets for ambiguity checks.',
                          'Native card set codes and the native numeric product shorthand are included in addition to the three required alias sources.',
                          'finish_rules preserve native regexes, order, and exact/prefix behavior. In particular reverse/mirror matches the reverse family.',
                          'casefoldOverrides is applied per code point after NFKC, using override when present and lowercase otherwise; do not lowercase the override result.',
                          'The override map compares every Unicode code point with actual guarded Node lowercase output, covering Python/Node Unicode-version differences.',
                          'Every native collector_journey._reply_scope variant alias is included in finishes and finish_rules with literal boundaries for ASCII tokens.',
                          'native_whitespace_regex enumerates every Python Unicode whitespace code point. Substitute it for native \\s when compiling finish and negated-taste rules in JavaScript; positive grammars may remain narrower.',
                      ], python_network_attempts=len(ATTEMPTS),
                      node_network_attempts=javascript_casefold['node_network_attempts'])
    return result, provenance

with sqlite3.connect(DB.as_uri() + '?mode=ro', uri=True) as db:
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA query_only=ON')
    if '--inspect' in sys.argv:
        tables = [dict(r) for r in db.execute("SELECT name,sql FROM sqlite_schema WHERE name IN ('catalog_set_localized','catalog_vocabulary','collector_release_alias')")]
        print(json.dumps({'tables': tables, 'samples': {r['name']: [dict(row) for row in db.execute('SELECT * FROM "' + r['name'] + '" LIMIT 8')] for r in tables}, 'counts': {r['name']: db.execute('SELECT COUNT(*) FROM "' + r['name'] + '"').fetchone()[0] for r in tables}}, ensure_ascii=False, indent=2))
    else:
        result, provenance = generate(db)
        result_text = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
        provenance['output_sha256'] = hashlib.sha256(result_text.encode()).hexdigest()
        provenance_text = json.dumps(provenance, ensure_ascii=False, indent=2) + '\n'
        if '--check' in sys.argv:
            assert OUTPUT.read_text() == result_text, 'generated vocabulary differs'
            assert PROVENANCE.read_text() == provenance_text, 'generated provenance differs'
        else:
            OUTPUT.write_text(result_text)
            PROVENANCE.write_text(provenance_text)
        print(json.dumps(dict(passed=True, check='--check' in sys.argv,
                              database_sha256=DB_HASH, output_sha256=provenance['output_sha256'],
                              source_counts=result['source_counts'], python_network_attempts=len(ATTEMPTS))))
assert sha256(DB) == DB_HASH
assert not ATTEMPTS
