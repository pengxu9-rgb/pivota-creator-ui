import atexit
import hashlib
import json
import os
import pathlib
import socket
import sqlite3
import sys

# Read-only, hash-verified native replay. No provider client is imported.
BASE = pathlib.Path(os.environ['ADMISSION_NATIVE_ROOT']).resolve(strict=True)
DB = BASE / 'batch-v1/catalog.sqlite3'
REVISION = '10cec52b1334e9f1abafb2508ead08a0ed063c47288e8af1b87df147984818cf'
DB_HASH = 'a72ba074fdf13f426b5709f67926e631ad32f52e92d08ff3e1ab646ed3b8f204'
attempts = []

def deny_network(*args, **kwargs):
    attempts.append('socket_or_dns')
    raise RuntimeError('offline_network_denied')

for name in ('connect', 'connect_ex', 'bind', 'listen', 'sendto', 'sendmsg'):
    if hasattr(socket.socket, name):
        setattr(socket.socket, name, deny_network)
for name in ('create_connection', 'getaddrinfo', 'gethostbyname', 'gethostbyname_ex', 'gethostbyaddr', 'getnameinfo'):
    if hasattr(socket, name):
        setattr(socket, name, deny_network)
atexit.register(lambda: print(json.dumps({'python_network_attempts': len(attempts)}), file=sys.stderr, flush=True))

assert hashlib.file_digest(DB.open('rb'), 'sha256').hexdigest() == DB_HASH
roster_path = BASE / 'build-context-v2/payload/runtime-roster.json'
roster = json.loads(roster_path.read_text())
for name, expected in roster['source_files'].items():
    assert name.startswith('pokemon_index/') and '..' not in pathlib.Path(name).parts
    assert hashlib.file_digest((BASE / 'runtime-candidate' / name).open('rb'), 'sha256').hexdigest() == expected, name
assert len(roster['source_files']) == 69
sys.path.insert(0, str(BASE / 'runtime-candidate'))
from pokemon_index import collector_journey, core

db = sqlite3.connect('file:' + str(DB) + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
db.execute('PRAGMA query_only=ON')
print(json.dumps({'ready': True, 'revision': REVISION, 'database_sha256': DB_HASH,
                  'runtime_source_files_verified': len(roster['source_files']),
                  'runtime_roster_sha256': hashlib.sha256(roster_path.read_bytes()).hexdigest(),
                  'database_mode': 'read_only_query_only'}), flush=True)
for line in sys.stdin:
    envelope = json.loads(line)
    try:
        if envelope['path'] == '/collector-journey':
            body = collector_journey.replay(db, envelope['request'], revision=REVISION)
        elif envelope['path'] == '/catalog-status':
            body = core.catalog_status(db)
        else:
            raise ValueError('offline route rejected')
        print(json.dumps({'id': envelope['id'], 'status': 200, 'body': body}, ensure_ascii=False), flush=True)
    except Exception as exc:
        print(json.dumps({'id': envelope['id'], 'status': 400, 'body': {'error': str(exc), 'exception_type': type(exc).__name__}}), flush=True)
db.close()
assert not attempts, 'unexpected_network_attempt'
assert hashlib.file_digest(DB.open('rb'), 'sha256').hexdigest() == DB_HASH
