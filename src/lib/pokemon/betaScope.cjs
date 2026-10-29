"use strict";
const {createHash}=require("node:crypto");
const PROJECT="pivota-prod", SERVICE="pot-beta-app";
const STATE_BUCKET="pivota-prod-pot-beta-state-388293626878";
const IMAGE_BUCKET="pivota-prod-pot-beta-media-388293626878";
const APP_HOST="pot-beta-app-388293626878.us-west1.run.app";
const CATALOG_URL="https://pokemon-commerce-index-beta-388293626878.us-west1.run.app";
const CATALOG_AUDIENCE="https://pokemon-commerce-index-beta-gpx4jyrubq-uw.a.run.app";
const COOKIE="pokemon_pot_beta_session", RETENTION_MS=30*86400000;
function betaScope(env=process.env){
  if(env.POKEMON_CREATOR_BETA_MODE!=="true")return null;
  const off=["POKEMON_CREATOR_TEST_MODE","POKEMON_CREATOR_SYNTHETIC_DEMO","POKEMON_CREATOR_MANUAL_RESEARCH","POKEMON_PHYSICAL_FIXTURE_ENABLED","POKEMON_COMMERCE_MANAGED_SIDECAR","POKEMON_COMMERCE_FIXTURE","POKEMON_COMMERCE_CRAWL_ENABLED","POKEMON_COMMERCE_BNS_ENABLED","POKEMON_COMMERCE_PSA_ENABLED","POKEMON_COMMERCE_BNS_URL_PREVIEW"];
  const absent=["POKEMON_CREATOR_STATE_ENDPOINT","POKEMON_CREATOR_STATE_STARTED_AT","POKEMON_CREATOR_STATE_EXPIRES_AT","POKEMON_CREATOR_IMAGE_ENDPOINT","POKEMON_COMMERCE_URL","POKEMON_COMMERCE_TOKEN","POKEMON_COMMERCE_PUBLIC_LISTING_URLS","POKEMON_COMMERCE_PUBLIC_REQUEST_BUDGET","POKEMON_COMMERCE_EBAY_BROWSE_URLS","POKEMON_COMMERCE_BROWSER_RENDERER","POKEMON_COMMERCE_BROWSER_PROBE","PSA_API_TOKEN","BNS_PARTNER_BASE_URL","BNS_PARTNER_CLIENT_ID","BNS_PARTNER_CLIENT_SECRET","POKEMON_COMMERCE_QUOTE_DB"];
  if(env.K_SERVICE!==SERVICE||env.GOOGLE_CLOUD_PROJECT!==PROJECT||
    env.POKEMON_CREATOR_GOOGLE_ONLY!=="true"||env.POKEMON_CREATOR_STATE_DRIVER!=="gcs"||
    env.POKEMON_CREATOR_STATE_BUCKET!==STATE_BUCKET||env.POKEMON_CREATOR_STATE_NAMESPACE!=="beta-v1"||
    env.POKEMON_CREATOR_IMAGE_DRIVER!=="gcs"||env.POKEMON_CREATOR_IMAGE_BUCKET!==IMAGE_BUCKET||
    env.POKEMON_CREATOR_IMAGE_NAMESPACE!=="ui-20261013-full-ea57651c"||
    env.POKEMON_CREATOR_CATALOG_URL!==CATALOG_URL||env.POKEMON_CREATOR_CATALOG_AUDIENCE!==CATALOG_AUDIENCE||
    off.some(k=>env[k]!=="false")||absent.some(k=>Object.hasOwn(env,k)))
    throw Error("invalid_beta_configuration");
  return {project:PROJECT,service:SERVICE,bucket:STATE_BUCKET,namespace:"beta-v1",imageBucket:IMAGE_BUCKET,
    imageNamespace:env.POKEMON_CREATOR_IMAGE_NAMESPACE,retentionMs:RETENTION_MS};
}
function principalSession(principal){
  if(typeof principal!=="string"||!/^[a-f0-9]{64}$/.test(principal))throw Error("beta_account_required");
  const b=createHash("sha256").update("pot-beta-session-v1:"+principal).digest().subarray(0,16);
  b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const v=b.toString("hex");return [v.slice(0,8),v.slice(8,12),v.slice(12,16),v.slice(16,20),v.slice(20)].join("-");
}
function bindPrincipalHeaders(headers,principal){
  const session=principalSession(principal);
  delete headers["x-pot-beta-iap"];
  headers["x-pot-beta-principal"]=principal;
  headers.cookie=COOKIE+"="+session;
}
module.exports={betaScope,principalSession,bindPrincipalHeaders,PROJECT,SERVICE,STATE_BUCKET,IMAGE_BUCKET,APP_HOST,CATALOG_URL,CATALOG_AUDIENCE,COOKIE,RETENTION_MS};
