"""Compose a private image context from two clean Git revisions; never deploy."""
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import tarfile

BUILD_FILES = {"package.json", "package-lock.json", "next.config.mjs", "next-env.d.ts",
               "tsconfig.json", "postcss.config.js", "tailwind.config.ts", ".eslintrc.json"}
RUNTIME = {"runtime.cjs", "commerce-sidecar.cjs", "catalog-artifact.cjs", "asset-path.cjs",
           "proxy-response.cjs", "api-path.cjs", "page-path.cjs"}


def git_tree(root):
    def git(*args):
        return subprocess.check_output(["git", "-C", str(root), *args])
    if git("status", "--porcelain", "--untracked-files=no").strip():
        raise ValueError("commit reviewed tracked changes before composing")
    sha = git("rev-parse", "HEAD").decode().strip()
    files = {}
    with tarfile.open(fileobj=io.BytesIO(git("archive", "--format=tar", "HEAD"))) as archive:
        for entry in archive:
            if entry.isdir():
                continue
            path = PurePosixPath(entry.name)
            if not entry.isfile() or path.is_absolute() or ".." in path.parts:
                raise ValueError("Git context contains a nonregular or unsafe entry")
            files[str(path)] = archive.extractfile(entry).read()
    return sha, files


def context_files(frontend, backend):
    result = {}
    for name, data in frontend.items():
        if name in BUILD_FILES or name.startswith(("src/", "public/")):
            result["creator/" + name] = data
    for name in RUNTIME:
        result["cloud/" + name] = frontend["cloud/pokemon/runtime/" + name]
    result["Dockerfile"] = frontend["cloud/pokemon/Dockerfile"]
    for name in ("snapshot.json", "snapshot.sha256"):
        result["private-coverage/" + name] = frontend["private-coverage/" + name]
    for name, data in backend.items():
        if name.startswith("pokemon_index/"):
            result["commerce-backend/" + name] = data
    required = ["creator/package-lock.json", "creator/src/lib/pokemon/purchaseLink.cjs",
                "creator/src/lib/pokemon/commerceContract.cjs", "creator/src/lib/pokemon/cloudTestScope.cjs",
                "commerce-backend/pokemon_index/commerce_service.py",
                "commerce-backend/pokemon_index/commerce_loop.py", "commerce-backend/pokemon_index/ebay_official.py"]
    if any(name not in result for name in required):
        raise ValueError("reviewed frontend/backend runtime closure is incomplete")
    for name in result:
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or any(part.startswith(".env") for part in path.parts):
            raise ValueError("unsafe build input")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend", required=True, type=Path)
    parser.add_argument("--backend", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if not all(path.is_absolute() for path in (args.frontend, args.backend, args.output)) or args.output.exists():
        parser.error("use absolute source paths and a new output directory")
    fe_sha, frontend = git_tree(args.frontend)
    be_sha, backend = git_tree(args.backend)
    files = context_files(frontend, backend)
    args.output.mkdir(parents=True)
    for name, data in files.items():
        destination = args.output / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    manifest = {"schema": "pokemon.private-image-context.v1", "frontend_sha": fe_sha, "backend_sha": be_sha,
                "deployment_performed": False, "providers_enabled": False,
                "files": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
    raw = (json.dumps(manifest, indent=2) + "\n").encode()
    (args.output / "context-manifest.json").write_bytes(raw)
    print(json.dumps({"frontend_sha": fe_sha, "backend_sha": be_sha, "files": len(files),
                      "manifest_sha256": hashlib.sha256(raw).hexdigest(), "deployment_performed": False}))


if __name__ == "__main__":
    main()
