#!/usr/bin/env python3
"""Read-only creator release routing. Requires only Python's standard library and Git."""

import argparse
import json
import os
import re
import subprocess
import sys


# Keep ownership narrow: an unknown file is creator/shared, including new workflows,
# dependencies, Docker/Next configuration, public assets and shared application code.
NON_CREATOR_PREFIXES = (
    b"src/app/creator/pokemon-collector/",
    b"src/app/api/creator-agent/pokemon-collector/",
    b"src/components/creator/pokemon/",
    b"src/lib/pokemon/",
    b"cloud/pokemon/",
    b"private-coverage/",
    # Tests/fixtures are not production inputs. Runtime source stays subject to the
    # explicit ownership rules above even when changed alongside a test.
    b"tests/",
    # Non-runtime evidence, never copied into the creator image.
    b"reports/",
)
NON_CREATOR_FILES = frozenset((
    b"src/components/creator/PokemonCards.tsx",
    b"src/components/creator/PokemonCreatorAgent.module.css",
    b"src/components/creator/pokemonClient.ts",
    b"scripts/prepare-private-coverage.cjs",
    b"scripts/release-routing.py",
    b"docs/creator-release-routing.md",
    b".github/workflows/pokemon-offline.yml",
    b".github/workflows/pot-release-preflight.yml",
    b".github/workflows/deploy-cloud-run.yml",
))
ZERO_SHA = "0" * 40


class RoutingError(Exception):
    pass


def git(*args):
    result = subprocess.run(
        ["git", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False
    )
    if result.returncode:
        raise RoutingError("Git could not verify the release boundary or read its paths")
    return result.stdout


def commit(sha):
    # Event boundaries must be full object IDs, never arbitrary revisions/options.
    if not re.fullmatch(r"[0-9a-fA-F]{40}", sha or "") or sha == ZERO_SHA:
        raise RoutingError("A release boundary is missing or is not a full commit SHA")
    canonical = git("rev-parse", "--verify", "--end-of-options", sha + "^{commit}")
    if canonical.strip().decode("ascii").lower() != sha.lower():
        raise RoutingError("A release boundary does not identify the expected commit")
    return sha.lower()


def changed_paths(before, after):
    after = commit(after)
    if before == ZERO_SHA:
        # A branch's first push has no parent boundary. Inspect its entire tree;
        # inspecting only the last commit could miss creator code added earlier.
        raw = git("ls-tree", "-r", "--name-only", "-z", after, "--")
    else:
        before = commit(before)
        # A missing/shallow/rewritten base is never permission to deploy. The
        # workflow fetches full history; a force-push needs explicit manual review.
        git("merge-base", "--is-ancestor", before, after)
        # Disable rename detection to include BOTH source and destination paths.
        # NUL delimiters preserve spaces, tabs, newlines and arbitrary path bytes.
        raw = git("diff", "--name-only", "-z", "--no-renames", before, after, "--")
    if raw and not raw.endswith(b"\0"):
        raise RoutingError("Git returned an incomplete path list")
    paths = raw.split(b"\0")[:-1]
    for path in paths:
        if not path or path.startswith(b"/") or any(
            part in (b"", b".", b"..") for part in path.split(b"/")
        ):
            raise RoutingError("Git returned an invalid repository path")
    return paths


def is_non_creator(path):
    return path in NON_CREATOR_FILES or path.startswith(NON_CREATOR_PREFIXES)


def route(event, ref, before, after, confirm_target):
    if ref != "refs/heads/main":
        raise RoutingError("Creator releases must run from refs/heads/main")
    if event == "workflow_dispatch":
        if confirm_target != "creator.pivota.cc":
            raise RoutingError("Manual creator releases require confirmation of creator.pivota.cc")
        commit(after)
        return {"deploy_creator": True, "reason": "explicit manual creator release", "path_count": 0}
    if event != "push":
        raise RoutingError("Unsupported creator release event")
    paths = changed_paths(before, after)
    creator_paths = [os.fsdecode(path) for path in paths if not is_non_creator(path)]
    return {
        "deploy_creator": bool(creator_paths),
        "reason": "creator/shared paths changed" if creator_paths else "only Pot/release/test paths changed or no changes",
        "path_count": len(paths),
        "creator_path_count": len(creator_paths),
        "creator_paths_sample": creator_paths[:20],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", required=True)
    parser.add_argument("--ref", required=True)
    parser.add_argument("--before", default="")
    parser.add_argument("--after", required=True)
    parser.add_argument("--confirm-target", default="")
    args = parser.parse_args()
    status = 0
    try:
        result = route(args.event, args.ref, args.before, args.after, args.confirm_target)
    except (RoutingError, OSError, UnicodeError) as error:
        result = {"deploy_creator": False, "reason": str(error), "error": True}
        status = 1
    # Only fixed booleans are written as workflow outputs; filenames are JSON
    # escaped on stdout and cannot introduce GitHub workflow commands/outputs.
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write("deploy_creator=" + str(result["deploy_creator"]).lower() + "\n")
    print(json.dumps(result, ensure_ascii=True, sort_keys=True))
    return status


if __name__ == "__main__":
    sys.exit(main())
