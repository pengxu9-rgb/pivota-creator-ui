# Private coverage review

`/creator/pokemon-collector/coverage` is a server-rendered review of a dated,
sanitized snapshot. It is unavailable on ordinary creator deployments. It has
no fetching, refresh, ingestion, quote, order, payment or activation control.

The page requires the exact private beta environment, all existing provider-off
flags, and the account principal that the existing beta gateway overwrites only
after validating a genuine IAP assertion. This is an additional scope check, not
a replacement authentication system. Private Cloud Run IAM and the IAP gateway
must remain in place. No user-supplied header establishes identity on its own.
The ordinary private composer does not package the beta gateway's IAP verifier
dependencies. Its default beta mode remains off. Enabling this page requires
the separately reviewed private beta runtime/authentication packaging and the
exact coverage path in its page allowlist.

## Public source and private snapshot

Git contains only a neutral report: all counts null, no cards, `unavailable`.
The production Dockerfile and production deployment workflow are unchanged.
The private composer copies this neutral file outside public assets and client
bundles, to `/app/private-coverage/snapshot.json`, alongside `snapshot.sha256`.
The server checks scope before file access; reads are bounded, hash-checked,
regular-file-only and do not follow symlinks. Missing or invalid data renders
“Coverage report unavailable,” never a zero-inventory claim.

Prepare a real snapshot locally from explicitly supplied read-only reports:

```sh
node scripts/prepare-private-coverage.cjs \
  --cohort /path/to/cohort-scorecard.json \
  --images /path/to/image-inventory.json \
  --offers /path/to/offer-scorecard.json \
  --catalog-status /path/to/catalog-status-evidence.json \
  --date YYYY-MM-DD \
  --out /path/to/new-private-output
```

Use the evidence date, not the build date. This command emits only a minimal
snapshot and its SHA-256. Raw source payloads, evidence file paths, storage
details, account identifiers and provider URLs are excluded. The converter
checks the catalog hash/count binding and the reports' offline safeguards;
those checks do not establish new source permissions or live availability.

A private build operator may replace the two neutral files in an isolated image
context. Record original and replacement file hashes, input report hashes and
the immutable image digest in private build evidence. Do not commit the real
snapshot or source evidence to this public repository. This is an image input,
not a browser-configurable path, URL, credential or API endpoint. A successful
build alone does not establish deployed IAM or signed-in functionality.

## Measurements

- Catalog records include variants and source versions, not distinct physical cards.
- Recorded image copies are historical copy evidence, not current browser-load verification.
- Missing offer/photo input remains null; an explicitly evaluated empty set can be zero.
- Price groups describe aligned seller claims, not approved catalog matches.
- Reviewed copy photos do not establish physical authenticity or certificate verification.
- The initial card queue is selected from retained acceptance tests, not demand/popularity data.

The page contains no source links, raw evidence panel or public JSON route. It
uses dynamic rendering with revalidation disabled. Private deployment checks
must confirm the actual route remains behind IAP, anonymous/direct-app access
is denied, and neither snapshot bytes nor a private sentinel appear in public
assets or `.next/static`.

## Checks

```sh
node --require ./tests/helpers/offline-network-guard.cjs --test tests/private-coverage.test.cjs
```

The existing offline CI includes these tests, the TypeScript check, the source
context composer and the network-isolated image test. There is no automatic
production or private deployment trigger added by this change.
