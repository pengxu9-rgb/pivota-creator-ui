"""Isolated Python worker denial used by the offline evidence gate, not app code."""
import atexit
import hashlib
import json
import os
from pathlib import Path
import socket
import sys
import time

audit_root = Path(sys.argv[1]).resolve(strict=True)
arguments = sys.argv[2:]
if arguments[:2] != ["-I", "-B"] or len(arguments) < 3:
    raise SystemExit("evidence Python guard requires -I -B")
if arguments[2] == "-c":
    if len(arguments) != 4:
        raise SystemExit("invalid isolated Python program")
    program, mode, source_file = arguments[3], "-c", None
else:
    source_file = Path(arguments[2]).resolve(strict=True)
    program, mode = source_file.read_text(), "file"
program_sha256 = hashlib.sha256(program.encode("utf-8")).hexdigest()
attempts = []
installed = []


def denied(name):
    def block(*args, **kwargs):
        attempts.append(name)
        raise RuntimeError("python_network_guard_blocked:" + name)
    return block


def audit_hook(event, arguments):
    if event.startswith("socket."):
        denied("audit:" + event)()


sys.addaudithook(audit_hook)
for name in ["connect", "connect_ex", "bind", "listen", "sendto", "sendmsg"]:
    if hasattr(socket.socket, name):
        setattr(socket.socket, name, denied("socket.socket." + name))
        installed.append("socket.socket." + name)
for name in ["create_connection", "create_server", "socketpair", "fromfd", "fromshare",
             "getaddrinfo", "getnameinfo", "gethostbyname", "gethostbyname_ex", "gethostbyaddr"]:
    if hasattr(socket, name):
        setattr(socket, name, denied("socket." + name))
        installed.append("socket." + name)


def finish():
    stamp = str(time.time_ns())
    record = {"schema": "pot.admission.evidence-python-guard.v1", "pid": os.getpid(),
              "ppid": os.getppid(), "cwd": os.getcwd(), "executable": sys.executable,
              "time_ns": stamp, "program_sha256": program_sha256, "mode": mode,
              "source_file": str(source_file) if source_file else None,
              "isolated": sys.flags.isolated, "dont_write_bytecode": sys.flags.dont_write_bytecode,
              "installed_before_program_exec": True, "audit_hook_installed": True,
              "installed_apis": installed, "attempts": attempts, "count": len(attempts)}
    destination = audit_root / (str(os.getpid()) + "-" + stamp + ".json")
    temporary = destination.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, destination)
    if attempts:
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(1)


atexit.register(finish)
assert sys.flags.isolated == 1 and sys.flags.dont_write_bytecode == 1
sys.argv = [str(source_file), *arguments[3:]] if source_file else ["-c"]
if source_file:
    sys.path.insert(0, str(source_file.parent))
exec(compile(program, str(source_file) if source_file else "<string>", "exec"),
     {"__name__": "__main__", "__builtins__": __builtins__,
      **({"__file__": str(source_file)} if source_file else {})})
