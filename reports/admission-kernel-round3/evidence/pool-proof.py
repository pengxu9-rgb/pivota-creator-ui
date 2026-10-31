"""Read-only complete catalog pools from admitted predicates, never raw text."""
import atexit
import hashlib
import json
import os
import pathlib
import socket
import sqlite3
import sys
import unicodedata

attempts = []
def deny_network(*args, **kwargs):
    attempts.append('socket_or_dns')
    raise RuntimeError('offline_network_denied')
for name in ('connect', 'connect_ex', 'bind', 'listen', 'sendto', 'sendmsg'):
    if hasattr(socket.socket, name): setattr(socket.socket, name, deny_network)
for name in ('create_connection', 'getaddrinfo', 'gethostbyname', 'gethostbyname_ex', 'gethostbyaddr', 'getnameinfo'):
    if hasattr(socket, name): setattr(socket, name, deny_network)
atexit.register(lambda: print(json.dumps({'python_network_attempts': len(attempts)}), file=sys.stderr, flush=True))

BASE = pathlib.Path(os.environ['ADMISSION_NATIVE_ROOT']).resolve(strict=True)
DB = BASE / 'batch-v1/catalog.sqlite3'
DB_HASH = 'a72ba074fdf13f426b5709f67926e631ad32f52e92d08ff3e1ab646ed3b8f204'
REVISION = '10cec52b1334e9f1abafb2508ead08a0ed063c47288e8af1b87df147984818cf'
DEX = dict(Charizard=6, Pikachu=25, Mewtwo=150, Mew=151, Eevee=133, Bulbasaur=1,
           Squirtle=7, Charmander=4, Umbreon=197, Gengar=94, Lugia=249,
           Rayquaza=384, Snorlax=143, Greninja=658, Dragonite=149, Blastoise=9,
           Venusaur=3, Lucario=448)
def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
assert hashlib.file_digest(DB.open('rb'), 'sha256').hexdigest() == DB_HASH
roster_path = BASE / 'build-context-v2/payload/runtime-roster.json'
roster = json.loads(roster_path.read_text())
assert len(roster['source_files']) == 69
for name, expected in roster['source_files'].items():
    assert name.startswith('pokemon_index/') and '..' not in pathlib.Path(name).parts
    assert hashlib.file_digest((BASE / 'runtime-candidate' / name).open('rb'), 'sha256').hexdigest() == expected

request = json.load(sys.stdin)
assert set(request) == {'schema', 'predicate'} and request['schema'] == 'pot.admission.pool-request.v1'
predicate = request['predicate']
assert set(predicate) == {'languages', 'scope', 'identity'}
assert predicate['languages'] in [['ja'], ['en'], ['ja', 'en']]
scope, identity = predicate['scope'], predicate['identity']
assert isinstance(scope, dict) and set(scope) <= {'set_code', 'collector_number', 'variant'}
assert all(isinstance(v, str) and 0 < len(v) <= 80 for v in scope.values())
assert set(identity) == {'subject', 'form'} and identity['subject'] in [None, *DEX]
assert identity['form'] in [None, 'ex']
db = sqlite3.connect('file:' + str(DB) + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
db.execute('PRAGMA query_only=ON')
def form_matches(name, language, form):
    text = unicodedata.normalize('NFKC', name).casefold()
    return int(text.endswith(' ' + form) or text.endswith('-' + form) if language == 'en' else text.endswith(form))
db.create_function('admitted_form_matches', 3, form_matches, deterministic=True)

def pool_for(value):
    subject = value['identity']['subject']
    # Materializing the effective dex-ID view once avoids a correlated full
    # view scan for each card. No ranking, page limit, observed candidate ID,
    # observed set value, raw question or native response enters this query.
    sql = ('WITH ids AS MATERIALIZED (SELECT DISTINCT card_id FROM discovery_card_facet '
           "WHERE facet_type='dex_id' AND CAST(value AS INTEGER)=?) " if subject else '')
    sql += 'SELECT c.card_id,c.language,c.set_code,c.collector_number,c.variant,c.name FROM card c'
    params = [DEX[subject]] if subject else []
    if subject: sql += ' JOIN ids ON ids.card_id=c.card_id'
    sql += ' WHERE c.language IN (' + ','.join('?' for _ in value['languages']) + ')'
    params.extend(value['languages'])
    for field in ('set_code', 'collector_number', 'variant'):
        if field in value['scope']:
            sql += ' AND c.' + field + '=?'
            params.append(value['scope'][field])
    if value['identity']['form']:
        sql += ' AND admitted_form_matches(c.name,c.language,?)=1'
        params.append(value['identity']['form'])
    sql += ' ORDER BY c.card_id'
    rows = [dict(row) for row in db.execute(sql, params)]
    ids = [row['card_id'] for row in rows]
    return dict(predicate=value, predicate_sha256=digest(value), raw_scope=value['scope'],
                normalized_scope=value['scope'], scope_normalization='exact admitted values; no case, padding or alias expansion', sql=sql, sql_parameters=params,
                sql_sha256=hashlib.sha256(sql.encode()).hexdigest(), rows=rows,
                card_ids=ids, card_count=len(ids), card_ids_sha256=digest(ids),
                values={field: sorted({row[field] for row in rows}) for field in ('set_code', 'variant')})

pool = pool_for(predicate)
counterfactuals = []
for omitted in predicate['scope']:
    broader = dict(predicate, scope={k: v for k, v in scope.items() if k != omitted})
    counterfactuals.append(dict(omitted=omitted, **pool_for(broader)))
db.close()
assert not attempts
assert hashlib.file_digest(DB.open('rb'), 'sha256').hexdigest() == DB_HASH
print(json.dumps(dict(schema='pot.admission.complete-pool-proof.v1', predicate=predicate,
    provenance=dict(revision=REVISION, database_sha256=DB_HASH, database_mode='read_only_query_only',
                    runtime_source_files_verified=69,
                    runtime_source_hashes=roster['source_files'],
                    runtime_roster_sha256=hashlib.sha256(roster_path.read_bytes()).hexdigest()),
    worker_sha256=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest(),
    predicate_sha256=digest(predicate), pool=pool, counterfactuals=counterfactuals,
    python_network_attempts=len(attempts)), ensure_ascii=False), flush=True)
