"""Pass one existing cached token to the guarded collector; never refresh it."""
import atexit
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import sys
import os

attempts = []


def deny(name):
    def blocked(*args, **kwargs):
        attempts.append(name)
        raise RuntimeError("token_launcher_network_denied")
    return blocked


def network_audit(event, args):
    if event.startswith("socket."):
        deny("audit:" + event)()


sys.addaudithook(network_audit)
for name in ["connect", "connect_ex", "bind", "listen", "sendto", "sendmsg"]:
    if hasattr(socket.socket, name):
        setattr(socket.socket, name, deny("socket.socket." + name))
for name in ["create_connection", "create_server", "socketpair", "fromfd", "fromshare",
             "getaddrinfo", "getnameinfo", "gethostbyname", "gethostbyname_ex", "gethostbyaddr"]:
    if hasattr(socket, name):
        setattr(socket, name, deny("socket." + name))


def finish():
    print(json.dumps({"token_launcher_network_audit": {"count": len(attempts),
          "attempts": attempts, "refresh_calls": 0}}), file=sys.stderr, flush=True)
    if attempts:
        os._exit(1)


atexit.register(finish)


def cached_token(cache, now, account):
    uri = cache.resolve(strict=True).as_uri() + "?mode=ro"
    with sqlite3.connect(uri, uri=True) as connection:
        row = connection.execute("SELECT access_token, token_expiry FROM access_tokens WHERE account_id = ?",
                                 (account,)).fetchone()
    if row is None or not isinstance(row[0], str) or not 16 <= len(row[0]) <= 16384 or not re.fullmatch(r"[A-Za-z0-9._~+/\-]+=*", row[0]):
        raise RuntimeError("cached_token_unavailable")
    expiry = datetime.fromisoformat(str(row[1]).replace("Z", "+00:00"))
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry < now + timedelta(minutes=45):
        raise RuntimeError("cached_token_lifetime_under_45_minutes")
    return bytearray(row[0], "ascii"), expiry


def main(args):
    if len(args) != 3 or not re.fullmatch(r"[a-z][a-z0-9-]{4,61}[a-z0-9]", args[0]) or not re.fullmatch(r"[a-f0-9]{64}", args[1]):
        raise RuntimeError("invalid_launcher_arguments")
    project, corpus_sha, output = args
    account = os.environ.get("POT_VERTEX_ACCOUNT", "").strip()
    if not account:
        raise RuntimeError("POT_VERTEX_ACCOUNT_required")
    here = Path(__file__).resolve().parent
    node = Path(shutil.which("node") or "").resolve(strict=True)
    if not node.is_file():
        raise RuntimeError("node_unavailable")
    token, expiry = cached_token(Path.home() / ".config/gcloud/access_tokens.db", datetime.now(timezone.utc), account)
    environment = {"PATH": str(node.parent) + os.pathsep + "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C",
        "PYTHONDONTWRITEBYTECODE": "1", "POT_LIVE_PROJECT_ID": project,
        "POT_LIVE_TOKEN_EXPIRES_AT": expiry.isoformat(), "NODE_OPTIONS": "--require=" + str(here / "live-allowlist-guard.cjs")}
    child, failed = None, False
    try:
        child = subprocess.Popen([str(node), str(here / "collect.cjs"), project, corpus_sha, output],
                                 cwd=here.parents[1], env=environment, stdin=subprocess.PIPE)
        child.stdin.write(token)
        child.stdin.close()
    except Exception:
        failed = True
    finally:
        token[:] = b"\0" * len(token)
        if child is not None and child.stdin is not None and not child.stdin.closed:
            child.stdin.close()
    status = child.wait() if child is not None else 1
    if failed:
        raise RuntimeError("collector_start_failed")
    return status


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except Exception as error:
        if str(error) == "cached_token_lifetime_under_45_minutes":
            print("cached_token_lifetime_under_45_minutes; refresh it yourself with the proxy on: gcloud auth print-access-token > /dev/null", file=sys.stderr, flush=True)
        else:
            print("token_launcher_failed_no_refresh", file=sys.stderr, flush=True)
        sys.exit(1)
