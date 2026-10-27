# Private Pokémon image context

This directory packages the reviewed Pokémon gateway/sidecar separately from the existing production creator app. It does not change the root Dockerfile, Vercel configuration or production workflows. Do not run the existing main deployment workflow for this preview.

After committing the reviewed frontend/backend changes, compose a new local context:

```sh
python3 cloud/pokemon/compose.py --frontend /absolute/frontend-checkout \
  --backend /absolute/backend-checkout --output /absolute/new-context
docker build -t pokemon-private-test /absolute/new-context
python3 tests/smoke-private-image.py pokemon-private-test
```

CI pins the backend to [PR #24](https://github.com/pengxu9-rgb/pokemon-commerce-index/pull/24), commit `02416ebdc6cfeabafc6431a2501d41ea7ed79a32` (tree `d401b197f5442f531371238953bb60a4d4a7a784`). Use that exact checkout when reproducing its image context; a later backend revision requires a new paired build and manifest.

The composer reads tracked files from the exact two Git commits, rejects tracked worktree changes, maps frontend source into `creator/`, and includes only the backend `pokemon_index/` runtime. It emits every context file's SHA-256 and both source revisions in `context-manifest.json`. Untracked files, credentials, `.env` files, operator state and backend test fixtures are not included.

The image disables crawling, eBay Browse, BNS and PSA by default. Its gateway retains the existing exact private staging scope and server-only provider isolation. Starting a service, granting access, configuring credentials or enabling a provider requires a separate explicit operation; composing/building does none of those. Beta entry/OAuth configuration, browser crawling packages, catalog artifacts and production deployment scripts are deliberately absent. This image supports private staging with those capabilities disabled.

For a separately approved offline staging run, retain the fresh `cloudTestScope`/durable-storage/catalog admission configuration and set `POKEMON_COMMERCE_MANAGED_SIDECAR=true`, `POKEMON_COMMERCE_FIXTURE=true`, `POKEMON_COMMERCE_CRAWL_ENABLED=false`, `POKEMON_COMMERCE_EBAY_BROWSE_ENABLED=false`, `POKEMON_COMMERCE_BNS_ENABLED=false`, `POKEMON_COMMERCE_PSA_ENABLED=false`, and `POKEMON_CREATOR_BETA_MODE=false`. Do not attach eBay/BNS/PSA credentials, public-listing/browser configuration, quote databases or catalog-artifact flags. Keep the normal catalog session rather than enabling the separate static synthetic catalog demo. The managed sidecar supplies its own loopback token; it is not an operator credential.

The backend's regular `--fixture` service returns its existing synthetic `.invalid` listings. That private staging rehearsal is distinct from the standalone five-capture Browse transport fixture in the earlier local browser evidence; do not claim that an offline staging check establishes live eBay access or five live offers.

CI also starts the actual image CMD with `--network none` and a short synthetic staging configuration, waits for gateway health and the fixture sidecar, then removes only that test container. This verifies process startup and packaging without checking Google authentication, GCS operations or catalog responses. The configured service/bucket names are inert strings in that isolated container.

The inherited Pokémon UI checks include seller/grade/printing/currency contracts, fresh selection binding, price-only review, safe optional affiliate links and synthetic-link suppression. `node --require ./tests/helpers/offline-network-guard.cjs --test tests/*.test.cjs` runs the portable frontend checks. The earlier local browser harness remains separate evidence; its process/layout-specific fixture hooks are not added to the production repository.
