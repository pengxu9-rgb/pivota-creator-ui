"use strict";
const http = require("node:http"),
  path = require("node:path");
const { spawn } = require("node:child_process");
const {
  stateConfiguration,
} = require("../creator/src/lib/pokemon/googleState.cjs");
const { staticAssetAllowed } = require("./asset-path.cjs");
const { failProxyResponse } = require("./proxy-response.cjs");
const { apiPattern } = require("./api-path.cjs");
const { pagePathAllowed } = require("./page-path.cjs");
const {
  configuration: liveConfiguration,
} = require("../creator/src/lib/pokemon/liveCatalog.cjs");
const root = path.resolve(__dirname, ".."),
  env = process.env,
  local = env.POKEMON_CREATOR_LOCAL_TEST === "true" && !env.K_SERVICE;
const configuration = stateConfiguration();
const { betaScope, bindPrincipalHeaders, APP_HOST } = require("../creator/src/lib/pokemon/betaScope.cjs");
const beta = betaScope(env);
const verifyBeta = beta ? require("./beta-entry/access.cjs").createBetaVerifier() : null;
const betaQuota = beta ? require("../creator/src/lib/pokemon/betaQuota.cjs").createBetaQuota({config:configuration}) : null;
if (!configuration || (!local && (!env.K_SERVICE || configuration.mock)))
  throw new Error("durable_google_state_required");
liveConfiguration(env);
require("../creator/src/lib/pokemon/catalogImageStore.cjs").configuration(env);
const port = Number(env.PORT || 8737),
  nextPort = Number(env.POKEMON_NEXT_PORT || 8081);
const origin = new URL(env.POKEMON_CREATOR_DEMO_ORIGIN || "");
if (
  origin.protocol !== "http:" ||
  origin.hostname !== "127.0.0.1" ||
  !origin.port ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
)
  throw new Error("invalid_proxy_origin");
const {
  cloudTestScope,
} = require("../creator/src/lib/pokemon/cloudTestScope.cjs");
if (!local && !cloudTestScope(env) && !beta)
  throw new Error("private_test_scope_required");
const allowedHost = (host) =>
  host === origin.host ||
  (beta && [APP_HOST,"pot-beta-app-gpx4jyrubq-uw.a.run.app"].includes(host)) ||
  (!local && !beta &&
    typeof host === "string" &&
    !/\s/.test(host) &&
    host.split(".")[0].length <= 63 &&
    /^(?:[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?---)?pokemon-creator-ui-test-[a-z0-9-]+\.(?:a\.run\.app|us-west1\.run\.app)$/.test(
      host || "",
    ));
if (
  [port, nextPort].some(
    (value) => !Number.isInteger(value) || value < 1024 || value > 65535,
  ) ||
  port === nextPort
)
  throw new Error("invalid_ports");
let stopping = false,
  server;
const creator = path.join(root, "creator"),
  nextEnv = {
    ...env,
    PORT: String(nextPort),
    HOSTNAME: "127.0.0.1",
    POKEMON_CREATOR_DEMO_ENABLED: "true",
    POKEMON_PHYSICAL_FIXTURE_ENABLED: "false",
    NEXT_TELEMETRY_DISABLED: "1",
  };
const commerce = require("./commerce-sidecar.cjs").start(root, env);
if (commerce) Object.assign(nextEnv, commerce.env);
// Only the read-only sidecar needs provider access. The Next proxy uses its
// per-instance loopback token, not marketplace or PSA/BNS credentials.
for (const key of ["PSA_API_TOKEN", "BNS_PARTNER_BASE_URL", "BNS_PARTNER_CLIENT_ID", "BNS_PARTNER_CLIENT_SECRET", "POKEMON_COMMERCE_QUOTE_DB"])
  delete nextEnv[key];
for (const key of Object.keys(nextEnv))
  if (/^(?:EBAY_|POKEMON_COMMERCE_EBAY_)/.test(key)) delete nextEnv[key];
const child = spawn(
  process.execPath,
  env.POKEMON_NEXT_STANDALONE === "true"
    ? [path.join(creator, local ? ".next/standalone/server.js" : "server.js")]
    : [
        path.join(creator, "node_modules/next/dist/bin/next"),
        "start",
        "-H",
        "127.0.0.1",
        "-p",
        String(nextPort),
      ],
  { cwd: creator, env: nextEnv, stdio: ["ignore", "inherit", "inherit"] },
);
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server?.close();
  child.kill("SIGTERM");
  commerce?.child.kill("SIGTERM");
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    process.exit(code);
  }, 1500);
  timer.unref();
  child.once("exit", () => process.exit(code));
}
child.once("error", () => stop(1));
child.once("exit", () => {
  if (!stopping) process.exit(1);
});
commerce?.child.once("error", () => stop(1));
commerce?.child.once("exit", () => { if (!stopping) stop(1); });
async function ready() {
  if (commerce && !(await commerce.ready())) return false;
  return new Promise((resolve) => {
    const req = http.get(
      "http://127.0.0.1:" + nextPort + "/creator/pokemon-collector",
      { headers: { Host: origin.host } },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.setTimeout(1000, () => req.destroy());
    req.on("error", () => resolve(false));
  });
}
function route(req) {
  let url;
  try {
    url = new URL(req.url, "http://127.0.0.1");
  } catch {
    return false;
  }
  if (!allowedHost(req.headers.host)) return false;
  const pathname = url.pathname;
  if (apiPattern.test(pathname))
    return (
      req.method === "POST" &&
      !url.search &&
      req.headers.origin === origin.origin &&
      req.headers["x-collector-intent"] === "decision" &&
      /^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")
    );
  if (
    req.method === "GET" &&
    pathname === "/api/creator-agent/pokemon-collector/media"
  )
    return true;
  return (
    req.method === "GET" &&
    (pagePathAllowed(pathname) ||
      staticAssetAllowed(pathname) ||
      /^\/pivota-brand\/[a-zA-Z0-9/_.-]+$/.test(pathname))
  );
}
function proxy(req, res) {
  const headers = { ...req.headers, host: origin.host };
  for (const key of Object.keys(headers))
    if (
      key === "authorization" ||
      key.startsWith("x-forwarded-") ||
      key === "forwarded"
    )
      delete headers[key];
  const upstream = http.request({
    hostname: "127.0.0.1",
    port: nextPort,
    path: req.url,
    method: req.method,
    headers,
  });
  let settled = false,
    bytes = 0;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
  };
  const abort = () => {
    if (settled) return;
    finish();
    upstream.destroy();
    failProxyResponse(res);
  };
  const research = req.url === "/api/creator-agent/pokemon-collector/commerce/research";
  const timer = setTimeout(abort, research ? 55000 : 42000);
  req.on("data", (part) => {
    bytes += part.length;
    if (bytes > 262144) {
      upstream.destroy();
      if (!res.headersSent) res.writeHead(413);
      res.end();
      finish();
    }
  });
  req.on("aborted", abort);
  res.on("close", () => {
    if (!res.writableEnded) abort();
    else finish();
  });
  upstream.on("error", () => {
    if (!settled) abort();
  });
  upstream.on("response", (response) => {
    if (settled) {
      response.destroy();
      return;
    }
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
    response.on("end", finish);
    response.on("error", abort);
  });
  req.pipe(upstream);
}
(async () => {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && !stopping) {
    if (await ready()) {
      server = http.createServer(async (req, res) => {
        if (!allowedHost(req.headers.host)) {
          res.writeHead(404);
          res.end();
          return;
        }
        if (beta) {
          try {
            const principal=await verifyBeta(req.headers["x-pot-beta-iap"]);
            bindPrincipalHeaders(req.headers,principal);
          } catch {
            res.writeHead(401,{"Content-Type":"application/json","Cache-Control":"no-store"});
            res.end(JSON.stringify({error:"beta_sign_in_required"}));return;
          }
        }
        if (req.url === "/health" && req.method === "GET") {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify({ ok: true, catalog_mode: "remote_only" }));
          return;
        }
        if ((req.url === "/" || (beta && req.url === "/creator/pokemon-collector")) && req.method === "GET") {
          res.writeHead(302, {
            Location: env.POKEMON_MOBILE_UI === "true" ? "/creator/pokemon-collector/shopper" : "/creator/pokemon-collector",
            "Cache-Control": "no-store",
          });
          res.end();
          return;
        }
        if (!route(req)) {
          res.writeHead(404, { "Cache-Control": "no-store" });
          res.end();
          return;
        }
        if(beta&&req.method==="POST"){
          if(req.url.startsWith("/api/creator-agent/pokemon-collector/commerce/")){
            res.writeHead(503,{"Content-Type":"application/json","Cache-Control":"no-store"});
            res.end(JSON.stringify({error:"browsing_beta_only"}));return;
          }
          try{await betaQuota.admit(req.headers["x-pot-beta-principal"]);}
          catch(error){const limited=error.code==="beta_usage_limit";res.writeHead(limited?429:503,{"Content-Type":"application/json","Cache-Control":"no-store","Retry-After":String(Number.isInteger(error.retryAfter)?Math.max(1,error.retryAfter):60)});res.end(JSON.stringify({error:limited?"beta_usage_limit":"beta_limit_unavailable"}));return;}
        }
        proxy(req, res);
      });
      server.headersTimeout = 10000;
      server.requestTimeout = 57000;
      server.listen(port, local ? "127.0.0.1" : "0.0.0.0", () =>
        process.stdout.write("pokemon_remote_ui_ready\n"),
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  stop(1);
})();
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());
