#!/usr/bin/env python3
"""Operator-only Pot release controller. Default action is read-only planning.

No build, credentials, IAM, environment, service access, or provider writes.
Only existing, separately qualified images can enter this release path.
"""
from __future__ import annotations

import argparse
import copy
from contextlib import contextmanager
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys

PROJECT = "pivota-prod"
REGION = "us-west1"
TARGET = "pot.pivota.cc"
SERVICES = ("pot-beta-app", "pot-beta")
REPOSITORY = f"{REGION}-docker.pkg.dev/{PROJECT}/cloud-run-source-deploy"
SCHEMA = "pot-release-plan.v1"
LIFETIME = 7200
BOOKKEEPING = {"run.googleapis.com/operation-id", "run.googleapis.com/urls",
               "run.googleapis.com/client-name", "run.googleapis.com/client-version",
               "serving.knative.dev/creator", "serving.knative.dev/lastModifier"}
REVIEW_FIELDS = {"private_beta_iap_runtime_reviewed", "private_snapshot_reviewed",
                 "dependencies_reviewed", "providers_orders_payments_off_reviewed", "genuine_signed_in_acceptance_reviewed"}
OFF_FLAGS = ("POKEMON_CREATOR_TEST_MODE", "POKEMON_CREATOR_SYNTHETIC_DEMO", "POKEMON_CREATOR_MANUAL_RESEARCH",
             "POKEMON_PHYSICAL_FIXTURE_ENABLED", "POKEMON_COMMERCE_MANAGED_SIDECAR", "POKEMON_COMMERCE_FIXTURE",
             "POKEMON_COMMERCE_CRAWL_ENABLED", "POKEMON_COMMERCE_BNS_ENABLED", "POKEMON_COMMERCE_PSA_ENABLED",
             "POKEMON_COMMERCE_BNS_URL_PREVIEW")
ABSENT_FLAGS = ("POKEMON_CREATOR_STATE_ENDPOINT", "POKEMON_CREATOR_STATE_STARTED_AT", "POKEMON_CREATOR_STATE_EXPIRES_AT",
                "POKEMON_CREATOR_IMAGE_ENDPOINT", "POKEMON_COMMERCE_URL", "POKEMON_COMMERCE_TOKEN",
                "POKEMON_COMMERCE_PUBLIC_LISTING_URLS", "POKEMON_COMMERCE_PUBLIC_REQUEST_BUDGET", "POKEMON_COMMERCE_EBAY_BROWSE_URLS",
                "POKEMON_COMMERCE_BROWSER_RENDERER", "POKEMON_COMMERCE_BROWSER_PROBE", "PSA_API_TOKEN", "BNS_PARTNER_BASE_URL",
                "BNS_PARTNER_CLIENT_ID", "BNS_PARTNER_CLIENT_SECRET", "POKEMON_COMMERCE_QUOTE_DB")


class Refused(Exception):
    pass


def require(value, message):
    if not value:
        raise Refused(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def fingerprint(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def digest(value):
    return isinstance(value, str) and re.fullmatch(r"[0-9a-f]{64}", value) is not None


def image_valid(service, image):
    return isinstance(image, str) and re.fullmatch(
        re.escape(f"{REPOSITORY}/{service}@sha256:") + r"[0-9a-f]{64}", image) is not None


def private_read(path):
    """Read once from a regular, owned private file; hash exactly these bytes."""
    path = Path(path).absolute()
    require(path.resolve() == path, "private input path must not contain symlinks")
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(fd, "rb") as stream:
            info = os.fstat(stream.fileno())
            require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid(), "private input must be an owned regular file")
            require(stat.S_IMODE(info.st_mode) == 0o600, "private input must have mode 0600")
            require(info.st_size <= 1024 * 1024, "private input too large")
            raw = stream.read(1024 * 1024 + 1)
    except OSError as exc:
        raise Refused("cannot safely read private input") from exc
    require(len(raw) <= 1024 * 1024, "private input too large")
    try:
        data = json.loads(raw, object_pairs_hook=unique_object)
    except (ValueError, UnicodeError) as exc:
        raise Refused("invalid private JSON input") from exc
    return data, hashlib.sha256(raw).hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def write_plan(path, plan):
    path = Path(path).absolute()
    require(path.resolve() == path, "plan output must not contain symlinks")
    require(path.parent.is_dir(), "create a private operator directory first")
    # Keep real operator plans out of Git and every repository Docker context.
    require(not any((parent / ".git").exists() for parent in path.parents), "plan output must be outside Git worktrees")
    source = Path(__file__).resolve().parents[3]
    require(source not in path.parents, "plan output must be outside the source/build context")
    raw = json.dumps(plan, indent=2, sort_keys=True).encode() + b"\n"
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "wb") as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
    except OSError as exc:
        raise Refused("cannot create a fresh private plan; existing files are never overwritten") from exc
    return hashlib.sha256(raw).hexdigest()


@contextmanager
def operator_lock():
    """Serialize all plans using this operator account, with one fixed target lock.

    gcloud has no compare-and-swap flag for these operations. This lock cannot
    serialize another account/host/console: the operator must exclude those
    writers for the release window. Fresh reads detect observed remote drift.
    """
    directory = Path.home() / ".local/state/pot-release"
    require(directory.resolve() == directory, "operator lock directory must not contain symlinks")
    try:
        info = directory.stat()
        require(stat.S_ISDIR(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o700 and info.st_uid == os.getuid(),
                "operator lock directory must be owned mode 0700")
        fd = os.open(directory / f"{PROJECT}-{REGION}.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "r+b") as stream:
            info = os.fstat(stream.fileno())
            require(stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o600,
                    "operator lock must be an owned regular 0600 file")
            try:
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise Refused("another Pot release holds the shared operator lock") from exc
            yield
    except OSError as exc:
        raise Refused("prepare the fixed private operator lock directory before mutating") from exc


class Gcloud:
    """A closed command builder; no arbitrary gcloud arguments or shell calls."""

    def call(self, arguments):
        try:
            result = subprocess.run(["gcloud", *arguments, "--project", PROJECT, "--format=json", "--quiet"],
                                    check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            return json.loads(result.stdout)
        except (OSError, subprocess.SubprocessError, ValueError) as exc:
            # gcloud output may include account identities or runtime values.
            raise Refused("gcloud operation failed; inspect it privately with the operator account") from exc

    def project(self):
        return self.call(["projects", "describe", PROJECT])

    def service(self, service):
        require(service in SERVICES, "service outside Pot scope")
        return self.call(["run", "services", "describe", service, "--region", REGION])

    def iam(self, service):
        require(service in SERVICES, "service outside Pot scope")
        return self.call(["run", "services", "get-iam-policy", service, "--region", REGION])

    def iap(self):
        return self.call(["iap", "web", "get-iam-policy", "--resource-type=cloud-run", "--service=pot-beta", "--region", REGION])

    def revision(self, service, revision):
        require(service in SERVICES and valid_revision(service, revision), "revision outside Pot scope")
        return self.call(["run", "revisions", "describe", revision, "--region", REGION])

    def candidate_exists(self, service, revision):
        require(service in SERVICES and valid_revision(service, revision), "revision outside Pot scope")
        rows = self.call(["run", "revisions", "list", "--service", service, "--region", REGION,
                          "--filter", "metadata.name=" + revision, "--limit=2"])
        require(isinstance(rows, list), "invalid revision inventory")
        return bool(rows)

    def stage(self, service, image, suffix, tag):
        require(service in SERVICES and image_valid(service, image), "image outside Pot scope")
        require(re.fullmatch(r"pr-[0-9a-f]{16}", suffix) and tag == "potcheck-" + suffix[3:], "invalid owned staging identity")
        return self.call(["run", "deploy", service, "--region", REGION, "--image", image,
                          "--revision-suffix", suffix, "--tag", tag, "--no-traffic"])

    def traffic(self, service, weights):
        require(service in SERVICES and valid_weights(service, weights), "traffic outside Pot scope")
        argument = ",".join(f"{revision}={percent}" for revision, percent in sorted(weights.items()))
        return self.call(["run", "services", "update-traffic", service, "--region", REGION, "--to-revisions", argument])

    def cleanup(self, service, tag):
        require(service in SERVICES and re.fullmatch(r"potcheck-[0-9a-f]{16}", tag), "invalid owned tag")
        return self.call(["run", "services", "update-traffic", service, "--region", REGION, "--remove-tags", tag])


def valid_revision(service, revision):
    return isinstance(revision, str) and re.fullmatch(re.escape(service) + r"-[a-z0-9][a-z0-9-]{0,47}", revision) is not None


def valid_weights(service, weights):
    return isinstance(weights, dict) and bool(weights) and all(valid_revision(service, key) and type(value) is int and 0 < value <= 100
                                                            for key, value in weights.items()) and sum(weights.values()) == 100


def routes(service, data):
    weights, tags = {}, {}
    for item in data["spec"]["traffic"]:
        revision = item.get("revisionName")
        require(valid_revision(service, revision) and not item.get("latestRevision"), "all traffic and tags must pin exact Pot revisions; LATEST is unsafe")
        percent = item.get("percent", 0)
        require(type(percent) is int and 0 <= percent <= 100, "invalid traffic percentage")
        if percent:
            weights[revision] = weights.get(revision, 0) + percent
        if "tag" in item:
            tag = item["tag"]
            require(isinstance(tag, str) and re.fullmatch(r"[a-z][a-z0-9-]{0,62}", tag) and tag not in tags, "invalid or duplicate traffic tag")
            tags[tag] = revision
    require(valid_weights(service, weights), "traffic must sum to 100")
    return {"weights": weights, "tags": tags}


def annotations(data):
    return {key: value for key, value in data.get("annotations", {}).items() if key not in BOOKKEEPING}


def runtime_spec(spec, service):
    spec = copy.deepcopy(spec)
    containers = spec.get("containers", [])
    require(len(containers) == 1, "exactly one existing container required")
    # Revision describe materializes this documented service-generated name.
    if containers[0].get("name") == service + "-1":
        containers[0].pop("name")
    return spec


def config_fingerprint(data, service):
    spec = copy.deepcopy(data["spec"])
    spec.pop("traffic")
    template = spec["template"]
    template["metadata"] = {"annotations": annotations(template.get("metadata", {})),
                            "labels": template.get("metadata", {}).get("labels", {})}
    template["spec"] = runtime_spec(template["spec"], service)
    template["spec"]["containers"][0]["image"] = "[separately-bound-image]"
    return fingerprint({"spec": spec, "annotations": annotations(data["metadata"]), "labels": data["metadata"].get("labels", {})})


def nonpublic(policy):
    require(isinstance(policy, dict) and isinstance(policy.get("bindings", []), list), "invalid IAM/IAP policy")
    require(not any(member in {"allUsers", "allAuthenticatedUsers"}
                    for binding in policy.get("bindings", []) for member in binding.get("members", [])), "public IAM/IAP principal forbidden")


def safety(service, data, namespace, iam, iap):
    metadata = data["metadata"]
    require(metadata["name"] == service and metadata["namespace"] == namespace, "service identity/project mismatch")
    require(metadata.get("labels", {}).get("cloud.googleapis.com/location") == REGION, "service region mismatch")
    annot = metadata.get("annotations", {})
    require(annot.get("run.googleapis.com/invoker-iam-disabled") not in {"true", True}, "invoker IAM check must remain enabled")
    nonpublic(iam)
    if service == "pot-beta":
        require(annot.get("run.googleapis.com/iap-enabled") == "true", "entry IAP must be enabled")
        nonpublic(iap)
    spec = data["spec"]["template"]["spec"]
    require(len(spec.get("containers", [])) == 1 and bool(spec.get("serviceAccountName")), "existing single-container service account required")
    env_rows = spec["containers"][0].get("env", [])
    env = {item["name"]: item for item in env_rows}
    require(len(env) == len(env_rows), "duplicate runtime environment keys")
    if service == "pot-beta-app":
        for name in ("POKEMON_CREATOR_BETA_MODE", "POKEMON_CREATOR_GOOGLE_ONLY"):
            require(env.get(name, {}).get("value") == "true", "private beta/Google-only runtime required")
        for name in OFF_FLAGS:
            require(env.get(name, {}).get("value") == "false", "provider-off runtime required")
        require(not any(name in env for name in ABSENT_FLAGS), "beta endpoint/provider/secret override forbidden")
        require(env.get("GOOGLE_CLOUD_PROJECT", {}).get("value") == PROJECT
                and all(env.get(name, {}).get("value") == "gcs" for name in ("POKEMON_CREATOR_STATE_DRIVER", "POKEMON_CREATOR_IMAGE_DRIVER")), "private beta storage/project runtime required")
    for name, value in env.items():
        require(not name.startswith(("EBAY_", "BNS_PARTNER_", "PSA_API_"))
                and not (name.startswith("POKEMON_COMMERCE_EBAY_") and name != "POKEMON_COMMERCE_EBAY_BROWSE_ENABLED"), "provider credential/endpoint override forbidden")
        if (re.search(r"(?:CRAWL|BNS|PSA|EBAY|ORDER|PAYMENT).*ENABLED$", name)
                or name in {"POKEMON_COMMERCE_BNS_URL_PREVIEW", "POKEMON_COMMERCE_FIXTURE", "POKEMON_PHYSICAL_FIXTURE_ENABLED",
                            "POKEMON_CREATOR_TEST_MODE", "POKEMON_CREATOR_SYNTHETIC_DEMO", "POKEMON_CREATOR_MANUAL_RESEARCH"}):
            require(value.get("value") == "false", "provider/order/payment/fixture enablement forbidden")
    require(any(row.get("type") == "Ready" and row.get("status") == "True" for row in data["status"].get("conditions", [])), "service is not Ready")
    require(type(metadata.get("generation")) is int and metadata["generation"] == data["status"].get("observedGeneration"),
            "service generation has not reconciled")
    require(routes(service, data) == routes(service, {"spec": {"traffic": data["status"].get("traffic", [])}}),
            "actual serving traffic/tags differ from desired traffic")


def snapshot(cloud, service, namespace):
    data = cloud.service(service)
    iam = cloud.iam(service)
    iap = cloud.iap() if service == "pot-beta" else None
    safety(service, data, namespace, iam, iap)
    status = data["status"]
    image = data["spec"]["template"]["spec"]["containers"][0]["image"]
    require(image_valid(service, image), "existing template must use exact private-service repository digest")
    identity = {"latest_created": status["latestCreatedRevisionName"], "latest_ready": status["latestReadyRevisionName"],
                "template_revision": data["spec"]["template"]["metadata"]["name"], "image": image}
    require(all(valid_revision(service, identity[key]) for key in ("latest_created", "latest_ready", "template_revision")), "invalid baseline revision identity")
    require(identity["latest_created"] == identity["latest_ready"] == identity["template_revision"], "baseline contains a pending/failed revision")
    return data, {"config_sha256": config_fingerprint(data, service), "iam_sha256": fingerprint(iam),
                  "iap_sha256": fingerprint(iap), "routes": routes(service, data), "identity": identity}


def namespace_for(cloud):
    project = cloud.project()
    require(project.get("projectId") == PROJECT and re.fullmatch(r"[0-9]+", str(project.get("projectNumber", ""))), "project identity mismatch")
    return str(project["projectNumber"])


def qualification(path, images):
    data, sha = private_read(path)
    require(set(data) == {"schema", "target", "images", *REVIEW_FIELDS}, "unexpected image qualification report fields")
    require(data["schema"] == "pot-image-qualification.v1" and data["target"] == TARGET and data["images"] == images,
            "external image qualification must bind these exact private images and target")
    require(all(data.get(key) is True for key in REVIEW_FIELDS), "image qualification reviews incomplete")
    return sha


def create_plan(cloud, images, qualification_sha, now=None):
    require(set(images) == set(SERVICES) and all(image_valid(service, images[service]) for service in SERVICES), "only exact reviewed Pot repository digests are allowed")
    require(digest(qualification_sha), "qualification fingerprint required")
    namespace = namespace_for(cloud)
    plan_id = secrets.token_hex(8)
    now = int(now if now is not None else dt.datetime.now(dt.timezone.utc).timestamp())
    services = {}
    for service in SERVICES:
        _, baseline = snapshot(cloud, service, namespace)
        revision = service + "-pr-" + plan_id
        tag = "potcheck-" + plan_id
        require(tag not in baseline["routes"]["tags"] and revision not in baseline["routes"]["weights"]
                and revision not in baseline["routes"]["tags"].values() and revision != baseline["identity"]["latest_created"], "staging identity collision")
        require(not cloud.candidate_exists(service, revision), "candidate revision already exists")
        rollback = {}
        for old_revision in baseline["routes"]["weights"]:
            old = cloud.revision(service, old_revision)
            old_image = old["status"].get("imageDigest")
            require(image_valid(service, old_image), "baseline traffic image repository invalid")
            healthy_revision(cloud, service, old_revision, old_image, namespace)
            rollback[old_revision] = {"image": old_image, "runtime_sha256": revision_fingerprint(old, service)}
        services[service] = {"image": images[service], "revision": revision, "baseline": baseline, "rollback": rollback}
    return {"schema": SCHEMA, "target": TARGET, "project": PROJECT, "region": REGION, "namespace": namespace,
            "id": plan_id, "created_at": now, "expires_at": now + LIFETIME, "qualification_sha256": qualification_sha,
            "services": services}


def validate_plan(plan, now=None):
    require(isinstance(plan, dict) and set(plan) == {"schema", "target", "project", "region", "namespace", "id", "created_at", "expires_at", "qualification_sha256", "services"}, "unexpected plan schema/fields")
    require(plan["schema"] == SCHEMA and plan["target"] == TARGET and plan["project"] == PROJECT and plan["region"] == REGION, "plan target outside Pot scope")
    require(isinstance(plan["namespace"], str) and re.fullmatch(r"[0-9]+", plan["namespace"]) and isinstance(plan["id"], str) and re.fullmatch(r"[0-9a-f]{16}", plan["id"]), "invalid plan identity")
    now = int(now if now is not None else dt.datetime.now(dt.timezone.utc).timestamp())
    require(type(plan["created_at"]) is int and type(plan["expires_at"]) is int and plan["expires_at"] - plan["created_at"] == LIFETIME
            and plan["created_at"] <= now < plan["expires_at"], "stale or future plan; create and approve a fresh plan")
    require(digest(plan["qualification_sha256"]) and set(plan["services"]) == set(SERVICES), "invalid plan service/qualification scope")
    for service, item in plan["services"].items():
        require(set(item) == {"image", "revision", "baseline", "rollback"} and image_valid(service, item["image"])
                and item["revision"] == service + "-pr-" + plan["id"], "invalid plan candidate")
        base = item["baseline"]
        require(set(base) == {"config_sha256", "iam_sha256", "iap_sha256", "routes", "identity"}
                and all(digest(base[key]) for key in ("config_sha256", "iam_sha256", "iap_sha256")), "invalid baseline fingerprints")
        identity = base["identity"]
        require(set(identity) == {"image", "latest_created", "latest_ready", "template_revision"} and image_valid(service, identity["image"])
                and all(valid_revision(service, identity[key]) for key in ("latest_created", "latest_ready", "template_revision"))
                and identity["latest_created"] == identity["latest_ready"] == identity["template_revision"], "invalid baseline identity")
        route = base["routes"]
        require(set(route) == {"weights", "tags"} and valid_weights(service, route["weights"])
                and isinstance(route["tags"], dict) and all(isinstance(tag, str) and re.fullmatch(r"[a-z][a-z0-9-]{0,62}", tag)
                                                           and valid_revision(service, revision) for tag, revision in route["tags"].items()), "invalid baseline traffic")
        require("potcheck-" + plan["id"] not in route["tags"] and item["revision"] not in route["weights"]
                and item["revision"] not in route["tags"].values() and item["revision"] != identity["latest_created"], "plan staging collision")
        require(isinstance(item["rollback"], dict) and set(item["rollback"]) == set(route["weights"])
                and all(set(old) == {"image", "runtime_sha256"} and image_valid(service, old["image"]) and digest(old["runtime_sha256"])
                        for old in item["rollback"].values()), "invalid bound rollback revisions")


def load_plan(path, approved_sha, now=None):
    plan, sha = private_read(path)
    require(digest(approved_sha) and secrets.compare_digest(sha, approved_sha), "plan bytes differ from explicit approved SHA-256")
    validate_plan(plan, now)
    return plan, sha


def revision_fingerprint(data, service):
    return fingerprint({"spec": runtime_spec(data["spec"], service), "annotations": annotations(data["metadata"])})


def healthy_revision(cloud, service, revision, image, namespace, template=None):
    data = cloud.revision(service, revision)
    require(data["metadata"]["name"] == revision and data["metadata"]["namespace"] == namespace
            and data["metadata"].get("labels", {}).get("serving.knative.dev/service") == service, "revision identity mismatch")
    require(data["status"].get("imageDigest") == image and data["spec"]["containers"][0]["image"] == image, "resolved revision image digest mismatch")
    conditions = {row["type"]: row for row in data["status"].get("conditions", [])}
    for name in ("Ready", "Active", "ContainerHealthy", "ResourcesAvailable"):
        require(conditions.get(name, {}).get("status") == "True" and conditions[name].get("reason") != "Retired", "candidate revision has not passed actual startup conditions")
    if template is not None:
        require(runtime_spec(data["spec"], service) == runtime_spec(template["spec"], service), "candidate runtime differs from preserved template")
        require(annotations(data["metadata"]) == annotations(template.get("metadata", {})), "candidate runtime annotations differ")
    return data


def expected_routes(plan, service, promoted=False, cleaned=False):
    item = plan["services"][service]
    route = copy.deepcopy(item["baseline"]["routes"])
    if promoted:
        route["weights"] = {item["revision"]: 100}
    if not cleaned:
        route["tags"]["potcheck-" + plan["id"]] = item["revision"]
    return route


def inspect_state(cloud, plan, service):
    data, current = snapshot(cloud, service, plan["namespace"])
    item = plan["services"][service]
    baseline = item["baseline"]
    for name in ("config_sha256", "iam_sha256", "iap_sha256"):
        require(current[name] == baseline[name], "runtime/security/IAM/IAP drift; no mutation allowed")
    if current == baseline:
        return "baseline", data
    require(current["identity"] == {"image": item["image"], "latest_created": item["revision"], "latest_ready": item["revision"], "template_revision": item["revision"]}, "revision/image identity drift")
    for state, promoted, cleaned in (("staged", False, False), ("promoted", True, False), ("cleaned", True, True), ("rolled-back", False, True)):
        if current["routes"] == expected_routes(plan, service, promoted, cleaned):
            return state, data
    raise Refused("traffic/tag drift; no mutation allowed")


def operate(cloud, plan, action):
    if action == "preflight":
        return _operate(cloud, plan, action)
    with operator_lock():
        return _operate(cloud, plan, action)


def _operate(cloud, plan, action):
    validate_plan(plan)
    require(namespace_for(cloud) == plan["namespace"], "project identity changed")
    allowed = {"stage": {"baseline", "staged"}, "promote": {"staged", "promoted"},
               "cleanup": {"staged", "promoted", "cleaned", "rolled-back"},
               "rollback": {"staged", "promoted", "cleaned", "rolled-back"}, "preflight": {"baseline", "staged", "promoted", "cleaned", "rolled-back"}}
    require(action in allowed, "unsupported action")
    states = {}
    # Check both services before the first write. Cloud Run has no two-service
    # transaction; subsequent reads fail closed if another operator changes it.
    for service in SERVICES:
        state, data = inspect_state(cloud, plan, service)
        require(state in allowed[action], "action is not allowed from current Pot release state")
        item = plan["services"][service]
        if action == "stage" and state == "baseline":
            require(not cloud.candidate_exists(service, item["revision"]), "candidate revision collision")
        if state in {"staged", "promoted"} or action == "promote":
            healthy_revision(cloud, service, item["revision"], item["image"], plan["namespace"], data["spec"]["template"])
        if action == "rollback":
            for revision, binding in item["rollback"].items():
                old = healthy_revision(cloud, service, revision, binding["image"], plan["namespace"])
                require(revision_fingerprint(old, service) == binding["runtime_sha256"], "bound rollback revision runtime changed")
        states[service] = state
    if action == "preflight":
        return states
    for service in SERVICES:
        validate_plan(plan)  # Recheck expiration immediately before each write.
        fresh = {name: inspect_state(cloud, plan, name) for name in SERVICES}
        require(all(fresh[name][0] == states[name] for name in SERVICES), "Pot changed since fresh preflight")
        state, data = fresh[service]
        item = plan["services"][service]
        if action == "stage" and state == "baseline":
            cloud.stage(service, item["image"], "pr-" + plan["id"], "potcheck-" + plan["id"])
            require(inspect_state(cloud, plan, service)[0] == "staged", "stage did not preserve expected traffic/configuration")
            staged = cloud.service(service)
            healthy_revision(cloud, service, item["revision"], item["image"], plan["namespace"], staged["spec"]["template"])
        elif action == "promote" and state == "staged":
            healthy_revision(cloud, service, item["revision"], item["image"], plan["namespace"], data["spec"]["template"])
            cloud.traffic(service, {item["revision"]: 100})
            require(inspect_state(cloud, plan, service)[0] == "promoted", "promotion verification failed")
        elif action == "rollback" and state in {"promoted", "cleaned"}:
            for revision, binding in item["rollback"].items():
                old = healthy_revision(cloud, service, revision, binding["image"], plan["namespace"])
                require(revision_fingerprint(old, service) == binding["runtime_sha256"], "bound rollback revision runtime changed")
            cloud.traffic(service, item["baseline"]["routes"]["weights"])
            require(inspect_state(cloud, plan, service)[0] in {"staged", "rolled-back"}, "rollback verification failed")
        elif action == "cleanup" and state in {"staged", "promoted"}:
            cloud.cleanup(service, "potcheck-" + plan["id"])
            require(inspect_state(cloud, plan, service)[0] in {"cleaned", "rolled-back"}, "owned tag cleanup verification failed")
        states[service] = inspect_state(cloud, plan, service)[0]
    return {service: inspect_state(cloud, plan, service)[0] for service in SERVICES}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", default="plan", choices=("plan", "validate", "preflight", "stage", "promote", "cleanup", "rollback"))
    parser.add_argument("--plan", type=Path, required=True, help="private 0600 plan outside Git/build context; output for plan, input otherwise")
    parser.add_argument("--app-image")
    parser.add_argument("--entry-image")
    parser.add_argument("--qualification", type=Path, help="private external image review record, required when planning")
    parser.add_argument("--approve-sha256", help="explicit SHA-256 of the exact reviewed plan bytes")
    args = parser.parse_args(argv)
    try:
        cloud = Gcloud()
        if args.action == "plan":
            require(args.qualification is not None and args.approve_sha256 is None, "planning requires external image qualification and creates a new unapproved plan")
            images = {"pot-beta-app": args.app_image, "pot-beta": args.entry_image}
            require(all(image_valid(service, image) for service, image in images.items()), "exact immutable app/entry repository digests required")
            qualification_sha = qualification(args.qualification, images)
            plan = create_plan(cloud, images, qualification_sha)
            sha = write_plan(args.plan, plan)
            print(json.dumps({"read_only": True, "plan_sha256": sha, "expires_at": plan["expires_at"], "target": TARGET,
                              "notice": "External image qualification and genuine signed-in acceptance remain operator prerequisites."}))
        else:
            require(not any((args.app_image, args.entry_image, args.qualification)), "image inputs only allowed while creating a new plan")
            plan, sha = load_plan(args.plan, args.approve_sha256)
            states = {} if args.action == "validate" else operate(cloud, plan, args.action)
            print(json.dumps({"action": args.action, "plan_sha256": sha, "states": states, "read_only": args.action in {"validate", "preflight"}}))
        return 0
    except (Refused, KeyError, TypeError, IndexError) as exc:
        # Never echo input data, policy members, environment values or gcloud logs.
        print("Refused: " + (str(exc) if isinstance(exc, Refused) else "malformed cloud/plan data"), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
