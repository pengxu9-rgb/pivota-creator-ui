# Creator and Pot release routing

Pushes to `main` run a read-only routing job in `deploy-cloud-run.yml`. It reads the complete Git diff from the push's before/after commits, with full history and NUL-delimited filenames. It does not use GitHub's limited path filters. Both sides of a rename and deleted files are classified. An initial push inspects the complete resulting tree. Missing commits, invalid boundaries, rewritten ancestry, and non-main dispatches fail closed: creator deployment cannot start.

Creator/shared application files, dependency manifests, root Docker/Next configuration, public assets, and unknown paths keep the automatic creator release. Pot-only changes skip it. The explicit Pot ownership is:

- `src/app/creator/pokemon-collector/` and `src/app/api/creator-agent/pokemon-collector/`
- `src/components/creator/pokemon/`, `PokemonCards.tsx`, `PokemonCreatorAgent.module.css`, and `pokemonClient.ts` in `src/components/creator/`
- `src/lib/pokemon/`, `cloud/pokemon/`, `private-coverage/`, and `scripts/prepare-private-coverage.cjs`
- `.github/workflows/pokemon-offline.yml` and `.github/workflows/pot-release-preflight.yml`

Release configuration is also non-runtime: `deploy-cloud-run.yml` itself, `scripts/release-routing.py`, and this document. This lets the separation change merge without releasing creator. Future release documents/configuration must be explicitly added to the router; unknown files remain conservative. Changes to the release workflow still warrant careful code review because they control future deployments.

`tests/` is nonproduction code, fixtures, and test helpers. Tests-only edits do not release creator; a shared production file changed with a test still does. Neither the creator Dockerfile nor application imports should start consuming `tests/` as runtime input without revisiting this rule. The generic `Build` workflow still builds every PR and main push.

`reports/` contains non-runtime evidence, never copied into the creator image. Reports-only edits do not release creator; a shared production file changed with a report still does. Neither the creator Dockerfile nor application imports should start consuming `reports/` as runtime input without revisiting this rule.

Only an eligible creator deploy job receives cloud OIDC permission and enters the `deploy-creator-ui` concurrency queue. A skipped Pot-only run cannot replace an already queued creator deployment. The target remains fixed to service `creator-ui`, registry `us-west1-docker.pkg.dev/pivota-prod/cloud-run-source-deploy/creator-ui`, and the creator deployment identity. This workflow never targets Pot.

For a manual creator redeploy or rollback, dispatch **Deploy to Cloud Run** from `main`, enter `creator.pivota.cc` in `confirm_target`, and optionally supply a commit SHA (7–40 hexadecimal characters). Empty SHA uses that run's main commit. The resolved commit must still belong to `origin/main`, and validation finishes before cloud authentication. An invalid or missing target confirmation skips deployment. A later eligible creator push may supersede a queued rollback; Pot-only pushes do not join that queue.

Run the focused routing and workflow guard tests with `node --test tests/release-routing.test.cjs`. Routing itself can be inspected without deployment:

```sh
python3 -I -B scripts/release-routing.py --event push --ref refs/heads/main \
  --before FULL_BEFORE_SHA --after FULL_AFTER_SHA
```

Its JSON report includes the decision and at most 20 creator/shared path examples; its decision uses every changed path without a file-count cap. [Pot release preparation](../cloud/pokemon/release/README.md) uses a manual preflight workflow without cloud credentials or deploy permission, then existing operator credentials for a reviewed immutable image.
