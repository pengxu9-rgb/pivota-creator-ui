"""Disabled until Claude's go for the exact plan and freeze; same read-only cached-token helper as attempt4."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys


# Each plan has its own go; a go for one plan never launches the other.
REVIEW_GO = {'smoke': 'claude_3c_smoke_go', 'reduced': 'claude_3c_reduced_go', 'compatibility': 'claude_3c_compat_go', 'heldout': 'claude_4_heldout_go'}
TOKEN_HELPER = 'reports/admission-kernel-live-model/token-launch.py'
NETWORK_GUARD = 'tests/helpers/strict-network-guard.cjs'
LOCK_FILE = '.checkpoint.lock'
LOCK_FD_ENV = 'POT_SHOPPING_RUN_LOCK_FD'


def verify_frozen_artifacts(root, freeze, required):
    if freeze.get('stage') != '3a' or freeze.get('live_run_enabled') is not False:
        raise RuntimeError('invalid_freeze')
    verified = set()
    helper_source = None
    for row in freeze['artifacts']:
        relative = row['path']
        if Path(relative).is_absolute() or '..' in Path(relative).parts or relative in verified:
            raise RuntimeError('invalid_frozen_artifact_path')
        contents = (root / relative).read_bytes()
        if hashlib.sha256(contents).hexdigest() != row['sha256']:
            raise RuntimeError('frozen_artifact_mismatch')
        if relative == TOKEN_HELPER:
            helper_source = contents
        verified.add(relative)
    if not required.issubset(verified) or helper_source is None:
        raise RuntimeError('frozen_artifact_required')
    return helper_source


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
    freeze_bytes = (here / 'freeze.json').read_bytes()
    actual = hashlib.sha256(freeze_bytes).hexdigest()
    if actual != args.freeze_sha:
        raise RuntimeError('freeze_mismatch')
    freeze = json.loads(freeze_bytes)
    if args.mode == 'live' and (os.environ.get('POT_SHOPPING_REVIEW_GO') != REVIEW_GO[args.plan]
                                or freeze.get('review_go', {}).get(args.plan) != REVIEW_GO[args.plan]):
        raise RuntimeError('claude_exact_freeze_review_required')
    if args.plan == 'heldout':
        if args.mode != 'live':
            raise RuntimeError('use_qualify_heldout_for_fake')
        if args.arm != 'L' or not args.heldout_fixture or not freeze.get('heldout_fixture'):
            raise RuntimeError('bound_heldout_required')
    raw = Path(args.raw).resolve(strict=True)
    if raw == root or root in raw.parents:
        raise RuntimeError('external_evidence_required')
    if not raw.is_dir():
        raise RuntimeError('run_directory_required')
    required = {NETWORK_GUARD, TOKEN_HELPER}
    required.update(str((here / name).relative_to(root)) for name in
                    ('token-launch.py', 'live-host.cjs', 'validate-heldout.cjs', 'run-directory.cjs', 'fake-worker.cjs'))
    helper_source = verify_frozen_artifacts(root, freeze, required)
    lock_fd = os.open(raw / LOCK_FILE, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        if not stat.S_ISREG(os.fstat(lock_fd).st_mode):
            raise RuntimeError('invalid_run_lock_fd')
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('run_directory_locked') from None
        return launch_locked(args, here, root, raw, actual, freeze.get('heldout_fixture'), helper_source, lock_fd)
    finally:
        # The detached worker inherits this open file description. Closing the
        # parent's copy leaves the worker's lock intact.
        os.close(lock_fd)


def launch_locked(args, here, root, raw, actual, heldout_binding, helper_source, lock_fd):
    if args.plan == 'heldout':
        # Check the bound bytes and replay the synthetic controls before touching the cache.
        verifier = (
            "require(process.argv[1]).loadQualified(process.argv[2],"
            "{expected:JSON.parse(process.argv[3])})"
            ".catch(()=>{process.stderr.write('heldout_validation_failed\\n');process.exitCode=1})"
        )
        env_check = dict(os.environ, NODE_OPTIONS='--require=' + str(root / NETWORK_GUARD))
        subprocess.run([shutil.which('node'), '-e', verifier, str(here / 'validate-heldout.cjs'),
                        args.heldout_fixture, json.dumps(heldout_binding)],
                       cwd=root, env=env_check, check=True, stdout=subprocess.DEVNULL)
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
    helper_path = str(root / TOKEN_HELPER)
    helper = {'__name__': 'shopping_cached_token_helper', '__file__': helper_path}
    exec(compile(helper_source, helper_path, 'exec'), helper)
    token, expiry = helper['cached_token'](cache, datetime.now(timezone.utc), account)
    environment = dict(os.environ, POT_LIVE_TOKEN_EXPIRES_AT=expiry.isoformat())
    environment[LOCK_FD_ENV] = str(lock_fd)
    if args.mode == 'fake':
        environment['NODE_OPTIONS'] = '--require=' + str(root / NETWORK_GUARD)
        command = [shutil.which('node'), str(here / 'fake-worker.cjs'), str(raw)]
    else:
        environment.pop('NODE_OPTIONS', None)
        command = [shutil.which('node'), str(here / 'live-host.cjs'), '--live', args.arm, str(raw), actual, args.plan] + ([args.heldout_fixture] if args.plan == 'heldout' else [])
    child = None
    try:
        with (raw / 'token-worker.log').open('ab') as log:
            child = subprocess.Popen(command, cwd=root, env=environment, stdin=subprocess.PIPE,
                                     stdout=log, stderr=log, start_new_session=True, pass_fds=(lock_fd,))
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
    except Exception as error:
        message = str(error)
        print(message if message == 'run_directory_locked' else 'shopping_token_launch_stopped_no_refresh',
              file=sys.stderr)
        sys.exit(1)
