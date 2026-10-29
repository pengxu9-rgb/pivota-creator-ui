# Private Pot release operator

This separate release path targets **https://pot.pivota.cc**, through only
`pot-beta-app` and the IAP entry `pot-beta` in `pivota-prod/us-west1`.
The public creator deployment follows [creator release routing](../../../docs/creator-release-routing.md).
Neither creator nor catalog is a writable target here.

`pot_release.py` uses the operator's existing `gcloud` credentials. It creates
no IAM/WIF identity, grant, secret, authentication session, or build. Its default
action creates a read-only release plan. The manual GitHub workflow runs only
offline tests with synthetic fixtures and `contents: read`; it never connects
to Google Cloud, accepts a real plan, or uploads private artifacts. Connected
GitHub Pot deployment requires separately approved identity/security work.

## Image qualification prerequisite

Use existing **immutable, independently reviewed** app and entry images from
the exact service repositories:

- `us-west1-docker.pkg.dev/pivota-prod/cloud-run-source-deploy/pot-beta-app@sha256:…`
- `us-west1-docker.pkg.dev/pivota-prod/cloud-run-source-deploy/pot-beta@sha256:…`

The ordinary `cloud/pokemon/compose.py` image is **not qualified beta packaging**.
It omits the separately reviewed beta/IAP authentication closure and private
snapshot; its source dependency version also differs from the accepted private
image. Do not rebuild a generic composer image and assume digest pinning makes
it suitable. This controller does not build or qualify images. Before planning,
an operator must review actual beta/IAP packaging, private snapshot binding,
dependency versions, and disabled providers/orders/payments, with evidence bound
to both final digests. Genuine signed-in acceptance must already bind those
same images through separately approved acceptance work. Store the real evidence privately outside this repository
and all Docker build contexts.

Create a private `0600` qualification record only after that review. This is an
operator attestation recording the external review, **not independent evidence**
that its assertions are true. The CLI binds its byte hash and exact image refs
to the plan; it cannot discover an untruthful qualification record. The following
digests and project number used by tests are synthetic; no real digest, account,
invited address, catalog data, or snapshot belongs in public examples.

```json
{
  "schema": "pot-image-qualification.v1",
  "target": "pot.pivota.cc",
  "images": {
    "pot-beta-app": "us-west1-docker.pkg.dev/pivota-prod/cloud-run-source-deploy/pot-beta-app@sha256:2222222222222222222222222222222222222222222222222222222222222222",
    "pot-beta": "us-west1-docker.pkg.dev/pivota-prod/cloud-run-source-deploy/pot-beta@sha256:2222222222222222222222222222222222222222222222222222222222222222"
  },
  "private_beta_iap_runtime_reviewed": true,
  "private_snapshot_reviewed": true,
  "dependencies_reviewed": true,
  "providers_orders_payments_off_reviewed": true,
  "genuine_signed_in_acceptance_reviewed": true
}
```

## Operator sequence

Use an owned private directory outside Git/build contexts for real plans,
qualification, browser evidence, and receipts. Inputs and plans must be regular,
owned `0600` files with no symlink path components. Output must be a new file;
overwrite and symlinks are refused. A plan contains exact images/revisions/traffic
and fingerprints of runtime, IAM and IAP policies, without environment values or
policy member identities. It expires after two hours. The controller hashes and
parses the same single file read; even whitespace edits require a new approval.

1. Exclude other writers to both services for the entire release window,
   including console operations, other machines/accounts, and manual deployments.
   Prepare the fixed shared operator lock directory once with mode `0700`:
   `mkdir -p "$HOME/.local/state/pot-release"` followed by
   `chmod 700 "$HOME/.local/state/pot-release"`. Every mutating action acquires
   one `0600` target lock across all plans using this operator account.
2. Create a plan with the two qualified image refs and the private qualification
   record. The omitted action defaults to `plan`; no service is changed:

   ```sh
   python3 cloud/pokemon/release/pot_release.py \
     --app-image "$POT_REVIEWED_APP_IMAGE" \
     --entry-image "$POT_REVIEWED_ENTRY_IMAGE" \
     --qualification "$POT_PRIVATE_DIR/qualification.json" \
     --plan "$POT_PRIVATE_DIR/release-plan.json"
   ```

3. Review the plan and external evidence. Copy the printed `plan_sha256` into
   `POT_APPROVED_PLAN_SHA256` only after review. Offline schema/hash validation
   and connected read-only drift preflight are separate commands:

   ```sh
   python3 cloud/pokemon/release/pot_release.py validate \
     --plan "$POT_PRIVATE_DIR/release-plan.json" --approve-sha256 "$POT_APPROVED_PLAN_SHA256"
   python3 cloud/pokemon/release/pot_release.py preflight \
     --plan "$POT_PRIVATE_DIR/release-plan.json" --approve-sha256 "$POT_APPROVED_PLAN_SHA256"
   ```

4. Only explicitly approved `stage` writes images. It deploys each exact digest
   with `--no-traffic`, a plan-bound revision suffix, and the owned
   `potcheck-<plan-id>` validation tag. It preserves all existing traffic/tags,
   runtime configuration, service account, security, IAM and IAP. It checks the
   actual candidate's image, runtime and `Ready`, `Active`, `ContainerHealthy`,
   and `ResourcesAvailable` conditions. A retired/min-zero revision without a
   tag does not prove startup. Keep the tag until promotion is verified:

   ```sh
   python3 cloud/pokemon/release/pot_release.py stage \
     --plan "$POT_PRIVATE_DIR/release-plan.json" --approve-sha256 "$POT_APPROVED_PLAN_SHA256"
   ```

5. Confirm the external qualification and genuine signed-in acceptance still
   apply to these exact two image digests. This controller **cannot provide
   prepromotion signed-in acceptance for a new image**: normal `pot.pivota.cc`
   traffic still reaches the old revisions, the entry keeps its existing app
   upstream, and the app may reject the candidate's tag host. A browser visit
   during staging therefore does not prove the staged image works. Startup
   conditions, simulated headers, fixtures, 401/404 responses and tag URLs do
   not establish signed-in functionality. Use an already externally accepted
   same-digest pair, or stop for a separately scoped and approved acceptance/
   promotion operation. Do not mark qualification true merely to proceed.
   That external acceptance must verify genuine IAP, the invited-user session,
   anonymous/direct-app denial and private data exclusion from public assets.
6. Explicit `promote` sends 100% to the exact healthy staged revisions after
   fresh checks of both services. `cleanup` removes only this plan's tag and
   retains every other tag. Use the same arguments above with those action names.
   Both actions require the exact approved plan SHA; a changed/stale plan or any
   runtime/identity/security/IAM/IAP/traffic/tag drift is refused.

## Failure and rollback

The controller's only cloud writes are `gcloud run deploy --image … --no-traffic
--revision-suffix … --tag …` and `run services update-traffic --to-revisions …`
or `--remove-tags <owned-tag>` on these two exact services. It never changes
environment variables, runtime flags, IAM, IAP, ingress, access flags or service
accounts. All existing beta scope off flags must be explicitly false; provider
credentials/endpoint overrides and enabled order/payment flags are refused.
All traffic must be pinned to revisions; `LATEST` routes are refused.

Cloud Run offers no transaction across the two services, and these `gcloud`
commands expose no compare-and-swap precondition. The fixed lock serializes this
operator account, **not other hosts/accounts/console writers**. The exclusive
operator window is a release prerequisite. Both services are re-read immediately
before each write, followed by verification. A remote race can still occur after
the final read; a failing post-check can occur after one service changed. Stop,
inspect privately, and reconcile observed state before any further action. Do
not interpret an error as proof that no cloud mutation occurred.

`stage` and `promote` can resume a partial operation while the plan is fresh and
both services remain in precisely recognized states. `rollback` restores only
the plan's exact prior revision weights, preserving tags and the newly staged
runtime template. It requires the recorded old revisions to retain their exact
image/runtime fingerprints and all four healthy conditions. It does not rebuild
or redeploy, reset configuration, or change IAM. A retired old revision, expired
plan, or any drift blocks automatic rollback; recovery then needs a separately
reviewed operation. Rollback can also be partial across services. `cleanup` can
remove the owned tag after promotion, rollback, or abandonment while the approved
plan remains valid. After abandonment cleanup, the staged revision may retire;
it is not eligible for promotion under this plan.

Run offline checks locally with:

```sh
python3 -B tests/pot-release-test.py -v
```
