"""One detached, non-restarting launch. No credential handling or network I/O."""
import argparse, json, os, shutil, subprocess, sys
from pathlib import Path
from datetime import datetime, timezone

network_attempts = []
def audit(event, args):
    if event.startswith('socket.'):
        network_attempts.append(event)
        raise RuntimeError('detached_launcher_network_denied')
sys.addaudithook(audit)
parser = argparse.ArgumentParser()
parser.add_argument('--root', required=True)
parser.add_argument('--mode', choices=['rehearsal', 'live'], required=True)
parser.add_argument('--launch-dir', required=True)
parser.add_argument('--raw-dir', required=True)
parser.add_argument('--project', default='pivota-prod')
parser.add_argument('--corpus-sha', default='c1c9912e16c7a491387f8d3e24c59493bfce5fd4f6437a72eaecaa9f26dafd73')
parser.add_argument('--worker', action='store_true')
args = parser.parse_args()
root = Path(args.root).resolve(strict=True)
launch, raw = Path(args.launch_dir).resolve(), Path(args.raw_dir).resolve()
if args.project != 'pivota-prod' or args.corpus_sha != 'c1c9912e16c7a491387f8d3e24c59493bfce5fd4f6437a72eaecaa9f26dafd73':
    raise RuntimeError('fixed_project_and_corpus_required')
for output in [launch, raw]:
    if output == root or root in output.parents:
        raise RuntimeError('external_output_required')
guard = root / 'tests/helpers/strict-network-guard.cjs'
environment = dict(os.environ, PYTHONDONTWRITEBYTECODE='1')
for name in list(environment):
    if name.lower() in ['http_proxy', 'https_proxy', 'all_proxy']:
        del environment[name]

def now():
    return datetime.now(timezone.utc).isoformat()

def atomic(file, value):
    temporary = file.with_name(file.name + '.tmp')
    temporary.write_text(json.dumps(value) + '\n')
    temporary.replace(file)

if args.worker:
    if os.getsid(0) != os.getpid():
        raise RuntimeError('worker_requires_own_session')
    if args.mode == 'live':
        command = [sys.executable, '-I', '-B', str(root / 'reports/admission-kernel-live-model/token-launch.py'), args.project, args.corpus_sha, str(raw)]
    else:
        environment['NODE_OPTIONS'] = '--require=' + str(guard)
        command = [shutil.which('node'), str(Path(__file__).resolve().with_name('detached-rehearsal.cjs')), str(root), str(raw)]
    atomic(launch / 'worker-start.json', {'pid': os.getpid(), 'session_id': os.getsid(0), 'mode': args.mode, 'started_at': now(), 'network_attempts': 0, 'signals_sent': 0})
    with (launch / 'collector.log').open('xb') as stream:
        result = subprocess.run(command, cwd=root, env=environment, stdin=subprocess.DEVNULL, stdout=stream, stderr=subprocess.STDOUT)
    atomic(launch / 'exit.json', {'pid': os.getpid(), 'mode': args.mode, 'exit_code': result.returncode,
        'finished_at': now(), 'final_receipt_exists': (raw / ('collection-summary.json' if args.mode == 'live' else 'rehearsal-final.json')).is_file(),
        'network_attempts': len(network_attempts), 'credential_values_read_by_launcher': False, 'signals_sent': 0})
else:
    launch.mkdir(parents=True, exist_ok=True)
    with (launch / 'launch.lock').open('x') as lock:
        lock.write('Single launch; never automatically restart.\n')
    if raw.exists():
        raise RuntimeError('preserve_existing_collection')
    command = ['/usr/bin/nohup', sys.executable, '-I', '-B', str(Path(__file__).resolve()), *sys.argv[1:], '--worker']
    with (launch / 'nohup.log').open('xb') as stream:
        child = subprocess.Popen(command, cwd=root, env=environment, stdin=subprocess.DEVNULL, stdout=stream,
            stderr=subprocess.STDOUT, start_new_session=True, close_fds=True)
    value = {'pid': child.pid, 'session_id': os.getsid(child.pid), 'process_group_id': os.getpgid(child.pid),
        'own_session': os.getsid(child.pid) == child.pid, 'nohup': True, 'mode': args.mode, 'launched_at': now(),
        'raw_dir': str(raw), 'network_attempts': len(network_attempts), 'signals_sent': 0}
    atomic(launch / 'pid.json', value)
    print(json.dumps(value))
