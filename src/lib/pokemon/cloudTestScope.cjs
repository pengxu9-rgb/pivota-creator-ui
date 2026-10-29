"use strict";
const TEST_SERVICE = "pokemon-creator-ui-test";
const TEST_BUCKET = "pivota-staging-pokemon-ui-test-184498324954";
function cloudTestScope(env = process.env, now = Date.now()) {
  const started = Date.parse(env.POKEMON_CREATOR_STATE_STARTED_AT);
  const expires = Date.parse(env.POKEMON_CREATOR_STATE_EXPIRES_AT);
  return (
    env.K_SERVICE === TEST_SERVICE &&
    env.POKEMON_CREATOR_TEST_MODE === "true" &&
    env.GOOGLE_CLOUD_PROJECT === "pivota-staging" &&
    env.POKEMON_CREATOR_GOOGLE_ONLY === "true" &&
    env.POKEMON_CREATOR_STATE_DRIVER === "gcs" &&
    env.POKEMON_CREATOR_STATE_BUCKET === TEST_BUCKET &&
    /^ui-[a-z0-9-]{3,50}$/.test(env.POKEMON_CREATOR_STATE_NAMESPACE || "") &&
    Number.isFinite(started) &&
    started <= now &&
    expires > now &&
    expires - started <= 86400000 &&
    expires > started
  );
}
function fixtureEnabled(env = process.env) {
  return (
    env.POKEMON_PHYSICAL_FIXTURE_ENABLED === "true" &&
    ((!env.K_SERVICE &&
      (env.POKEMON_CREATOR_STATE_DRIVER || "local") === "local") ||
      cloudTestScope(env))
  );
}
module.exports = { cloudTestScope, fixtureEnabled, TEST_BUCKET, TEST_SERVICE };
