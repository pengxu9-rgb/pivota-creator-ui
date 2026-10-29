"""Synthetic offline tests: never authenticate, build, or call cloud services."""
import copy
from contextlib import nullcontext
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import time
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "cloud/pokemon/release/pot_release.py"
SPEC = importlib.util.spec_from_file_location("pot_release", SOURCE)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)
REAL_OPERATOR_LOCK = release.operator_lock
NAMESPACE = "999999999999"


def image(service, digit):
    return f"{release.REPOSITORY}/{service}@sha256:" + digit * 64


def service_fixture(service):
    revision = service + "-00001-synthetic"
    env = {name: "false" for name in release.OFF_FLAGS}
    if service == "pot-beta-app":
        env.update({"POKEMON_CREATOR_BETA_MODE": "true", "POKEMON_CREATOR_GOOGLE_ONLY": "true",
                    "GOOGLE_CLOUD_PROJECT": release.PROJECT, "POKEMON_CREATOR_STATE_DRIVER": "gcs", "POKEMON_CREATOR_IMAGE_DRIVER": "gcs"})
    else:
        env = {"GOOGLE_CLOUD_PROJECT": release.PROJECT}
    annotations = {"run.googleapis.com/ingress": "all"}
    if service == "pot-beta":
        annotations["run.googleapis.com/iap-enabled"] = "true"
    result = {
        "metadata": {"name": service, "namespace": NAMESPACE, "generation": 1, "annotations": annotations,
                     "labels": {"cloud.googleapis.com/location": release.REGION}},
        "spec": {"template": {"metadata": {"name": revision, "annotations": {"autoscaling.knative.dev/maxScale": "1"}},
                              "spec": {"serviceAccountName": "synthetic@invalid.example", "containerConcurrency": 1,
                                       "containers": [{"image": image(service, "1"), "env": [{"name": name, "value": value} for name, value in env.items()]}]}},
                 "traffic": [{"revisionName": revision, "percent": 100}, {"revisionName": revision, "tag": "keep-existing", "percent": 0}]},
        "status": {"conditions": [{"type": "Ready", "status": "True"}], "observedGeneration": 1, "latestCreatedRevisionName": revision, "latestReadyRevisionName": revision}}
    result["status"]["traffic"] = copy.deepcopy(result["spec"]["traffic"])
    return result


def revision_fixture(service, data):
    template = data["spec"]["template"]
    return {"metadata": {"name": template["metadata"]["name"], "namespace": NAMESPACE,
                         "labels": {"serving.knative.dev/service": service}, "annotations": copy.deepcopy(template["metadata"].get("annotations", {}))},
            "spec": copy.deepcopy(template["spec"]), "status": {"imageDigest": template["spec"]["containers"][0]["image"],
            "conditions": [{"type": name, "status": "True"} for name in ("Ready", "Active", "ContainerHealthy", "ResourcesAvailable")]}}


class FakeCloud:
    def __init__(self):
        self.services = {name: service_fixture(name) for name in release.SERVICES}
        self.revisions = {data["spec"]["template"]["metadata"]["name"]: revision_fixture(name, data) for name, data in self.services.items()}
        self.policies = {name: {"bindings": [{"role": "roles/run.invoker", "members": ["serviceAccount:synthetic@invalid.example"]}], "etag": "synthetic"} for name in release.SERVICES}
        self.iap_policy = {"bindings": [{"role": "roles/iap.httpsResourceAccessor", "members": ["user:synthetic@invalid.example"]}], "etag": "synthetic"}
        self.mutations = []
        self.on_stage = None

    def project(self):
        return {"projectId": release.PROJECT, "projectNumber": NAMESPACE}

    def service(self, name):
        return copy.deepcopy(self.services[name])

    def iam(self, name):
        return copy.deepcopy(self.policies[name])

    def iap(self):
        return copy.deepcopy(self.iap_policy)

    def revision(self, name, revision):
        return copy.deepcopy(self.revisions[revision])

    def candidate_exists(self, name, revision):
        return revision in self.revisions

    def stage(self, name, candidate_image, suffix, tag):
        self.mutations.append(("stage", name, candidate_image, suffix, tag))
        data = self.services[name]
        revision = name + "-" + suffix
        data["spec"]["template"]["metadata"]["name"] = revision
        data["spec"]["template"]["spec"]["containers"][0]["image"] = candidate_image
        data["spec"]["traffic"].append({"revisionName": revision, "percent": 0, "tag": tag})
        data["status"]["latestCreatedRevisionName"] = revision
        data["status"]["latestReadyRevisionName"] = revision
        self.reconcile(name)
        self.revisions[revision] = revision_fixture(name, data)
        if self.on_stage:
            self.on_stage(name)

    def traffic(self, name, weights):
        self.mutations.append(("traffic", name, copy.deepcopy(weights)))
        tags = release.routes(name, self.services[name])["tags"]
        self.services[name]["spec"]["traffic"] = ([{"revisionName": revision, "percent": percent} for revision, percent in weights.items()]
                                                 + [{"revisionName": revision, "tag": tag, "percent": 0} for tag, revision in tags.items()])
        self.reconcile(name)

    def cleanup(self, name, tag):
        self.mutations.append(("cleanup", name, tag))
        self.services[name]["spec"]["traffic"] = [row for row in self.services[name]["spec"]["traffic"] if row.get("tag") != tag]
        self.reconcile(name)

    def reconcile(self, name):
        self.services[name]["metadata"]["generation"] += 1
        self.services[name]["status"]["observedGeneration"] = self.services[name]["metadata"]["generation"]
        self.services[name]["status"]["traffic"] = copy.deepcopy(self.services[name]["spec"]["traffic"])


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.lock_patch = patch.object(release, "operator_lock", return_value=nullcontext())
        self.lock_patch.start()
        self.addCleanup(self.lock_patch.stop)
        self.cloud = FakeCloud()
        self.images = {name: image(name, "2") for name in release.SERVICES}
        self.plan = release.create_plan(self.cloud, self.images, "3" * 64)

    def rejected_without_write(self, action="stage"):
        self.cloud.mutations.clear()
        with self.assertRaises((release.Refused, KeyError)):
            release.operate(self.cloud, self.plan, action)
        self.assertEqual([], self.cloud.mutations)

    def test_plan_and_preflight_are_read_only(self):
        self.assertEqual({name: "baseline" for name in release.SERVICES}, release.operate(self.cloud, self.plan, "preflight"))
        self.assertEqual([], self.cloud.mutations)
        serialized = json.dumps(self.plan)
        self.assertNotIn("synthetic@", serialized)
        self.assertNotIn("containers", serialized)
        self.assertNotIn("env", serialized)

    def test_stage_promote_cleanup_and_scoped_rollback(self):
        baseline = {name: copy.deepcopy(data) for name, data in self.cloud.services.items()}
        self.assertEqual(set(release.operate(self.cloud, self.plan, "stage").values()), {"staged"})
        for name in release.SERVICES:
            self.assertEqual(release.routes(name, baseline[name])["weights"], release.routes(name, self.cloud.services[name])["weights"])
            self.assertEqual(release.config_fingerprint(baseline[name], name), release.config_fingerprint(self.cloud.services[name], name))
        self.assertEqual(set(release.operate(self.cloud, self.plan, "promote").values()), {"promoted"})
        self.assertEqual(set(release.operate(self.cloud, self.plan, "cleanup").values()), {"cleaned"})
        self.assertEqual(set(release.operate(self.cloud, self.plan, "rollback").values()), {"rolled-back"})
        for name in release.SERVICES:
            self.assertEqual(release.routes(name, baseline[name]), release.routes(name, self.cloud.services[name]))
        self.assertTrue(all(row[1] in release.SERVICES for row in self.cloud.mutations))

    def test_replay_is_idempotent(self):
        release.operate(self.cloud, self.plan, "stage")
        count = len(self.cloud.mutations)
        release.operate(self.cloud, self.plan, "stage")
        self.assertEqual(count, len(self.cloud.mutations))

    def test_latest_traffic_rejected(self):
        data = self.cloud.services["pot-beta-app"]
        data["spec"]["traffic"][0] = {"latestRevision": True, "percent": 100}
        self.rejected_without_write()

    def test_generation_and_actual_serving_state_must_be_settled(self):
        self.cloud.services["pot-beta"]["metadata"]["generation"] += 1
        self.rejected_without_write()
        self.cloud = FakeCloud()
        self.cloud.services["pot-beta"]["status"]["traffic"][0]["percent"] = 0
        self.rejected_without_write()

    def test_coalesced_status_traffic_is_equivalent(self):
        for name, data in self.cloud.services.items():
            revision = data["spec"]["template"]["metadata"]["name"]
            data["status"]["traffic"] = [{"revisionName": revision, "percent": 100, "tag": "keep-existing", "url": "https://synthetic.invalid"}]
        self.assertEqual(set(release.operate(self.cloud, self.plan, "preflight").values()), {"baseline"})

    def test_every_beta_off_flag_is_required(self):
        for flag in release.OFF_FLAGS:
            cloud = FakeCloud()
            cloud.services["pot-beta-app"]["spec"]["template"]["spec"]["containers"][0]["env"] = [row for row in cloud.services["pot-beta-app"]["spec"]["template"]["spec"]["containers"][0]["env"] if row["name"] != flag]
            with self.subTest(flag=flag), self.assertRaises(release.Refused):
                release.create_plan(cloud, self.images, "3" * 64)
            self.assertEqual([], cloud.mutations)

    def test_provider_secret_and_payment_enablement_rejected(self):
        for name, value in [("POKEMON_COMMERCE_EBAY_BROWSE_ENABLED", "true"), ("PAYMENTS_ENABLED", "true"),
                            ("ORDERS_ENABLED", "true"), ("BNS_PARTNER_CLIENT_SECRET", "secret-synthetic"), ("POKEMON_CREATOR_STATE_ENDPOINT", "https://synthetic.invalid")]:
            cloud = FakeCloud()
            cloud.services["pot-beta-app"]["spec"]["template"]["spec"]["containers"][0]["env"].append({"name": name, "value": value})
            with self.subTest(name=name), self.assertRaises(release.Refused):
                release.create_plan(cloud, self.images, "3" * 64)

    def test_security_and_project_drift_rejected_before_any_write(self):
        for mutation in (lambda c: c.policies["pot-beta-app"]["bindings"][0]["members"].append("allUsers"),
                         lambda c: c.iap_policy["bindings"][0]["members"].append("allAuthenticatedUsers"),
                         lambda c: c.services["pot-beta"]["metadata"]["annotations"].update({"run.googleapis.com/iap-enabled": "false"}),
                         lambda c: c.services["pot-beta-app"]["metadata"]["annotations"].update({"run.googleapis.com/invoker-iam-disabled": "true"}),
                         lambda c: c.services["pot-beta"]["metadata"].update({"namespace": "000000"}),
                         lambda c: c.services["pot-beta"]["spec"]["template"]["spec"].update({"serviceAccountName": "changed@invalid.example"})):
            self.cloud = FakeCloud()
            mutation(self.cloud)
            self.rejected_without_write()

    def test_unhealthy_actual_revision_blocks_promotion(self):
        for condition in ("Ready", "Active", "ContainerHealthy", "ResourcesAvailable"):
            self.cloud = FakeCloud()
            release.operate(self.cloud, self.plan, "stage")
            revision = self.plan["services"]["pot-beta"]["revision"]
            for row in self.cloud.revisions[revision]["status"]["conditions"]:
                if row["type"] == condition:
                    row["status"] = "False"
            self.rejected_without_write("promote")

    def test_resolved_image_and_runtime_checked(self):
        for part in ("image", "runtime"):
            self.cloud = FakeCloud()
            release.operate(self.cloud, self.plan, "stage")
            revision = self.plan["services"]["pot-beta-app"]["revision"]
            if part == "image":
                self.cloud.revisions[revision]["status"]["imageDigest"] = image("pot-beta-app", "4")
            else:
                self.cloud.revisions[revision]["spec"]["timeoutSeconds"] = 999
            self.rejected_without_write("promote")

    def test_preserves_foreign_tags_and_rejects_any_drift(self):
        release.operate(self.cloud, self.plan, "stage")
        self.cloud.services["pot-beta"]["spec"]["traffic"].append({"revisionName": self.plan["services"]["pot-beta"]["revision"], "percent": 0, "tag": "foreign"})
        self.rejected_without_write("promote")
        self.rejected_without_write("cleanup")

    def test_second_service_drift_stops_after_first_stage(self):
        def drift(name):
            if name == "pot-beta-app":
                self.cloud.policies["pot-beta"]["etag"] = "concurrent-change"
        self.cloud.on_stage = drift
        with self.assertRaises(release.Refused):
            release.operate(self.cloud, self.plan, "stage")
        self.assertEqual(["pot-beta-app"], [row[1] for row in self.cloud.mutations])
        self.assertEqual(self.plan["services"]["pot-beta-app"]["baseline"]["routes"]["weights"], release.routes("pot-beta-app", self.cloud.services["pot-beta-app"])["weights"])

    def test_stage_collision_before_any_mutation(self):
        candidate = self.plan["services"]["pot-beta"]["revision"]
        self.cloud.revisions[candidate] = {}
        self.rejected_without_write()

    def test_invalid_and_stale_plans_rejected(self):
        for mutate in (lambda p: p.update({"project": "wrong-project"}), lambda p: p.update({"target": "creator.pivota.cc"}),
                       lambda p: p.update({"expires_at": 1}), lambda p: p["services"]["pot-beta-app"].update({"image": image("pot-beta-app", "2").replace("@sha256:", ":")}),
                       lambda p: p["services"]["pot-beta-app"].update({"image": image("pot-beta", "2")}),
                       lambda p: p["services"].update({"creator-ui": p["services"]["pot-beta"]})):
            saved = copy.deepcopy(self.plan)
            mutate(self.plan)
            self.rejected_without_write()
            self.plan = saved

    def test_plan_file_permissions_hash_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder).resolve() / "plan.json"
            sha = release.write_plan(path, self.plan)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            plan, actual = release.load_plan(path, sha)
            self.assertEqual(plan, self.plan)
            self.assertEqual(actual, sha)
            with self.assertRaises(release.Refused):
                release.write_plan(path, self.plan)
            with self.assertRaises(release.Refused):
                release.load_plan(path, "0" * 64)
            raw = path.read_bytes()
            path.write_bytes(raw + b" ")
            with self.assertRaises(release.Refused):
                release.load_plan(path, sha)
            path.chmod(0o644)
            with self.assertRaises(release.Refused):
                release.private_read(path)

    def test_symlink_and_repository_output_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder).resolve() / "plan.json"
            release.write_plan(path, self.plan)
            link = Path(folder).resolve() / "link.json"
            link.symlink_to(path)
            with self.assertRaises(release.Refused):
                release.private_read(link)
            with self.assertRaises(release.Refused):
                release.write_plan(link, self.plan)
            (Path(folder).resolve() / ".git").mkdir()
            with self.assertRaises(release.Refused):
                release.write_plan(Path(folder).resolve() / "other.json", self.plan)

    def test_exact_byte_hash_uses_one_read(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder).resolve() / "plan.json"
            sha = release.write_plan(path, self.plan)
            original = release.private_read
            def read_then_change(value):
                result = original(value)
                path.write_text("{}")
                return result
            with patch.object(release, "private_read", side_effect=read_then_change):
                plan, result = release.load_plan(path, sha)
            self.assertEqual(plan, self.plan)
            self.assertEqual(result, sha)

    def test_command_surface_never_changes_environment_iam_or_access(self):
        cloud = release.Gcloud()
        with patch.object(cloud, "call", return_value={}) as call:
            cloud.stage("pot-beta-app", self.images["pot-beta-app"], "pr-" + "a" * 16, "potcheck-" + "a" * 16)
            cloud.traffic("pot-beta", {"pot-beta-pr-" + "a" * 16: 100})
            cloud.cleanup("pot-beta", "potcheck-" + "a" * 16)
            for args in (item.args[0] for item in call.call_args_list):
                self.assertIn(release.REGION, args)
                self.assertTrue(any(service in args for service in release.SERVICES))
                self.assertFalse(any(word in " ".join(args) for word in ("allow-unauthenticated", "--set-env", "--update-env", "--service-account", "--ingress", "iam-policy", "--set-tags", "--clear-tags", "--source")))
            self.assertIn("--no-traffic", call.call_args_list[0].args[0])
            for service in ("creator-ui", "pokemon-commerce-index-beta"):
                with self.assertRaises(release.Refused):
                    cloud.stage(service, image("pot-beta", "2"), "pr-" + "a" * 16, "potcheck-" + "a" * 16)

    def test_qualification_report_binds_exact_images(self):
        data = {"schema": "pot-image-qualification.v1", "target": release.TARGET, "images": self.images,
                **{key: True for key in release.REVIEW_FIELDS}}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder).resolve() / "qualification.json"
            path.write_text(json.dumps(data))
            path.chmod(0o600)
            self.assertTrue(release.digest(release.qualification(path, self.images)))
            with self.assertRaises(release.Refused):
                release.qualification(path, {**self.images, "pot-beta": image("pot-beta", "5")})
            data["private_beta_iap_runtime_reviewed"] = False
            path.write_text(json.dumps(data))
            with self.assertRaises(release.Refused):
                release.qualification(path, self.images)

    def test_shared_operator_lock_serializes_all_plans(self):
        with tempfile.TemporaryDirectory() as folder:
            home = Path(folder).resolve()
            directory = home / ".local/state/pot-release"
            directory.mkdir(parents=True, mode=0o700)
            directory.chmod(0o700)
            with patch.object(release.Path, "home", return_value=home):
                with REAL_OPERATOR_LOCK():
                    with self.assertRaises(release.Refused):
                        with REAL_OPERATOR_LOCK():
                            self.fail("a different plan acquired the same target lock")
                with REAL_OPERATOR_LOCK():
                    pass
                lock = directory / f"{release.PROJECT}-{release.REGION}.lock"
                self.assertEqual(stat.S_IMODE(lock.stat().st_mode), 0o600)
                directory.chmod(0o755)
                with self.assertRaises(release.Refused):
                    with REAL_OPERATOR_LOCK():
                        self.fail("unsafe lock directory accepted")

    def test_retired_revision_and_changed_rollback_runtime_fail_closed(self):
        release.operate(self.cloud, self.plan, "stage")
        revision = self.plan["services"]["pot-beta"]["revision"]
        self.cloud.revisions[revision]["status"]["conditions"][0]["reason"] = "Retired"
        self.rejected_without_write("promote")
        self.cloud.revisions[revision]["status"]["conditions"][0].pop("reason")
        release.operate(self.cloud, self.plan, "promote")
        old_revision = next(iter(self.plan["services"]["pot-beta"]["rollback"]))
        self.cloud.revisions[old_revision]["spec"]["timeoutSeconds"] = 99
        self.rejected_without_write("rollback")

    def test_pending_serving_reconciliation_fails_after_write(self):
        release.operate(self.cloud, self.plan, "stage")
        self.cloud.mutations.clear()
        original = self.cloud.traffic
        def pending(name, weights):
            actual = copy.deepcopy(self.cloud.services[name]["status"]["traffic"])
            original(name, weights)
            self.cloud.services[name]["status"]["traffic"] = actual
        self.cloud.traffic = pending
        with self.assertRaises(release.Refused):
            release.operate(self.cloud, self.plan, "promote")
        self.assertEqual(1, len(self.cloud.mutations))
        self.assertEqual("pot-beta-app", self.cloud.mutations[0][1])


if __name__ == "__main__":
    unittest.main()
