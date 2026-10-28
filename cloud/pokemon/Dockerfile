# Private Pokémon staging image only. The repository's production Dockerfile
# and automatic main deployment remain unchanged.
ARG NODE_IMAGE=node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
FROM ${NODE_IMAGE} AS build
WORKDIR /build/creator
COPY creator/package.json creator/package-lock.json ./
RUN npm ci --ignore-scripts
COPY creator/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
COPY --from=build /build/creator/.next/standalone /app/creator
COPY --from=build /build/creator/.next/static /app/creator/.next/static
COPY --from=build /build/creator/public /app/creator/public
# Explicitly retain the unbundled CJS dependency graph used by the gateway.
COPY creator/src/lib/pokemon/ /app/creator/src/lib/pokemon/
COPY cloud/ /app/cloud/
# Neutral in Git/CI. A reviewed private composer may inject a dated sanitized
# snapshot and its hash here, outside public assets and Next client bundles.
COPY private-coverage/ /app/private-coverage/
RUN apt-get update && apt-get install -y --no-install-recommends python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY commerce-backend/pokemon_index/ /app/commerce-backend/pokemon_index/
ENV PORT=8080 POKEMON_NEXT_PORT=8081 POKEMON_NEXT_STANDALONE=true NEXT_TELEMETRY_DISABLED=1 PYTHONDONTWRITEBYTECODE=1
ENV POKEMON_CREATOR_BETA_MODE=false POKEMON_COMMERCE_CRAWL_ENABLED=false POKEMON_COMMERCE_BNS_ENABLED=false POKEMON_COMMERCE_PSA_ENABLED=false POKEMON_COMMERCE_EBAY_BROWSE_ENABLED=false POKEMON_COMMERCE_FIXTURE=false
USER 65532:65532
EXPOSE 8080
CMD ["node","/app/cloud/runtime.cjs"]
