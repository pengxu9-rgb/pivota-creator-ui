"""Start the actual private image offline; health only, no cloud or provider IO."""
from datetime import datetime, timedelta, timezone
import json
import subprocess
import sys
import time
import uuid


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: smoke-private-image.py LOCAL_IMAGE")
    name = "pokemon-offline-smoke-" + uuid.uuid4().hex[:12]
    now = datetime.now(timezone.utc)
    env = {
        "K_SERVICE": "pokemon-creator-ui-test",
        "GOOGLE_CLOUD_PROJECT": "pivota-staging",
        "POKEMON_CREATOR_TEST_MODE": "true",
        "POKEMON_CREATOR_GOOGLE_ONLY": "true",
        "POKEMON_CREATOR_STATE_DRIVER": "gcs",
        "POKEMON_CREATOR_STATE_BUCKET": "pivota-staging-pokemon-ui-test-184498324954",
        "POKEMON_CREATOR_STATE_NAMESPACE": "ui-ci-offline-smoke",
        "POKEMON_CREATOR_STATE_STARTED_AT": now.isoformat(),
        "POKEMON_CREATOR_STATE_EXPIRES_AT": (now + timedelta(minutes=90)).isoformat(),
        "POKEMON_CREATOR_IMAGE_DRIVER": "gcs",
        "POKEMON_CREATOR_IMAGE_BUCKET": "pivota-staging-pokemon-ui-test-184498324954",
        "POKEMON_CREATOR_IMAGE_NAMESPACE": "ui-ci-offline-smoke",
        "POKEMON_CREATOR_CATALOG_URL": "https://pokemon-commerce-index-42ogcsuwxq-uw.a.run.app",
        "POKEMON_CREATOR_DEMO_ORIGIN": "http://127.0.0.1:9007",
        "POKEMON_CREATOR_BETA_MODE": "false",
        "POKEMON_CREATOR_SYNTHETIC_DEMO": "false",
        "POKEMON_PHYSICAL_FIXTURE_ENABLED": "false",
        "POKEMON_COMMERCE_MANAGED_SIDECAR": "true",
        "POKEMON_COMMERCE_FIXTURE": "true",
        "POKEMON_COMMERCE_CRAWL_ENABLED": "false",
        "POKEMON_COMMERCE_EBAY_BROWSE_ENABLED": "false",
        "POKEMON_COMMERCE_BNS_ENABLED": "false",
        "POKEMON_COMMERCE_BNS_URL_PREVIEW": "false",
        "POKEMON_COMMERCE_PSA_ENABLED": "false",
    }
    command = ["docker", "run", "--detach", "--pull=never", "--network", "none", "--name", name]
    for key, value in env.items():
        command += ["--env", key + "=" + value]
    command.append(sys.argv[1])  # Retain the image's actual CMD and entrypoint.
    # Node fetch may discard a custom Host header. The gateway intentionally
    # accepts only the configured browser origin, so preserve it with node:http.
    probe = """const http=require('node:http');
      const fail=e=>{console.error(String(e.message||e));process.exitCode=1;};
      const req=http.get({hostname:'127.0.0.1',port:8080,path:'/health',
        headers:{Host:'127.0.0.1:9007'},timeout:2000},res=>{
        let text='';res.on('data',chunk=>{text+=chunk;if(text.length>4096)req.destroy(new Error('health body too large'));});
        res.on('error',fail);res.on('end',()=>{try{const b=JSON.parse(text);
          if(res.statusCode!==200||b.ok!==true)throw new Error('health status '+res.statusCode);
          process.stdout.write(JSON.stringify(b));}catch(e){fail(e);}});
      });req.on('timeout',()=>req.destroy(new Error('health timeout')));req.on('error',fail);"""
    try:
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, timeout=30)
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            result = subprocess.run(["docker", "exec", name, "node", "-e", probe],
                                    capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                logs = subprocess.check_output(["docker", "logs", name], stderr=subprocess.STDOUT, timeout=10)
                if b'"mode": "synthetic_fixture"' not in logs:
                    raise RuntimeError("synthetic commerce sidecar did not start")
                print(json.dumps({"passed": True, "network": "none", "actual_image_cmd": True,
                                  "gateway_health": json.loads(result.stdout), "fixture_sidecar_ready": True,
                                  "business_api_requests": 0}))
                return
            time.sleep(1)
        raise RuntimeError("private image did not become healthy: " + result.stderr[-1000:])
    except Exception:
        subprocess.run(["docker", "logs", name], check=False, timeout=10)
        raise
    finally:
        subprocess.run(["docker", "rm", "--force", name], check=False, stdout=subprocess.DEVNULL, timeout=10)


if __name__ == "__main__":
    main()
