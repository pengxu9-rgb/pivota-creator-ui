"""Disabled until Claude's go for the exact plan and freeze; same read-only cached-token helper as attempt4."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import runpy
import shutil
import subprocess
import sys


# Each plan has its own go; a go for one plan never launches the other.
REVIEW_GO = {'smoke': 'claude_3c_smoke_go', 'reduced': 'claude_3c_reduced_go', 'compatibility': 'claude_3c_compat_go', 'heldout': 'claude_4_heldout_go'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['fake', 'live'], required=True)
    parser.add_argument('--arm', choices=['L', 'P'], required=True)
    parser.add_argument('--raw', required=True)
    parser.add_argument('--freeze-sha', required=True)
    parser.add_argument('--plan', choices=['smoke', 'reduced', 'compatibility', 'heldout'], required=True)
    parser.add_argument('--fake-cache')
    parser.add_argument('--heldout-fixture')
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    root = here.parents[1]
    actual = hashlib.sha256((here / 'freeze.json').read_bytes()).hexdigest()
    if actual != args.freeze_sha:
        raise RuntimeError('freeze_mismatch')
    if args.mode == 'live' and os.environ.get('POT_SHOPPING_REVIEW_GO') != REVIEW_GO[args.plan]:
        raise RuntimeError('claude_exact_freeze_review_required')
    if args.plan == 'heldout':
        if args.mode != 'live':
            raise RuntimeError('use_qualify_heldout_for_fake')
        if args.arm != 'L' or not args.heldout_fixture or not json.loads((here / 'freeze.json').read_text()).get('heldout_fixture'):
            raise RuntimeError('bound_heldout_required')
        # The host revalidates every external byte before reading the handed-off token.
        verifier = "require(process.argv[1]).load(process.argv[2],{expected:require(process.argv[3]).heldout_fixture})"
        env_check = dict(os.environ, NODE_OPTIONS='--require=' + str(root / 'tests/helpers/strict-network-guard.cjs'))
        subprocess.run([shutil.which('node'), '-e', verifier, str(here / 'validate-heldout.cjs'), args.heldout_fixture, str(here / 'freeze.json')], cwd=root, env=env_check, check=True, stdout=subprocess.DEVNULL)
    raw = Path(args.raw).resolve(strict=True)
    if raw == root or root in raw.parents:
        raise RuntimeError('external_evidence_required')
    if args.mode == 'fake':
        if not args.fake_cache:
            raise RuntimeError('fake_cache_required')
        cache = Path(args.fake_cache).resolve(strict=True)
        if cache.name == 'access_tokens.db' or '.config' in cache.parts:
            raise RuntimeError('fake_cache_only')
        account = 'fixture_account'
    else:
        if args.fake_cache:
            raise RuntimeError('fake_cache_forbidden_live')
        cache = Path.home() / '.config/gcloud/access_tokens.db'
        account = os.environ.get('POT_VERTEX_ACCOUNT', '')
        if not account:
            raise RuntimeError('account_required')
    helper = runpy.run_path(str(here.parent / 'admission-kernel-live-model/token-launch.py'), run_name='shopping_cached_token_helper')
    token, expiry = helper['cached_token'](cache, datetime.now(timezone.utc), account)
    environment = dict(os.environ, POT_LIVE_TOKEN_EXPIRES_AT=expiry.isoformat())
    if args.mode == 'fake':
        environment['NODE_OPTIONS'] = '--require=' + str(root / 'tests/helpers/strict-network-guard.cjs')
        command = [shutil.which('node'), str(here / 'fake-worker.cjs'), str(raw)]
    else:
        environment.pop('NODE_OPTIONS', None)
        command = [shutil.which('node'), str(here / 'live-host.cjs'), '--live', args.arm, str(raw), actual, args.plan] + ([args.heldout_fixture] if args.plan == 'heldout' else [])
    child = None
    try:
        with (raw / 'token-worker.log').open('ab') as log:
            child = subprocess.Popen(command, cwd=root, env=environment, stdin=subprocess.PIPE, stdout=log, stderr=log, start_new_session=True)
            child.stdin.write(token)
            child.stdin.close()
        (raw / 'pid.json').write_text(json.dumps({'pid': child.pid, 'mode': args.mode, 'arm': args.arm, 'detached': True}) + '\n')
    finally:
        token[:] = b'\0' * len(token)
        if child is not None and child.stdin is not None and not child.stdin.closed:
            child.stdin.close()
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        print('shopping_token_launch_stopped_no_refresh', file=sys.stderr)
        sys.exit(1)
