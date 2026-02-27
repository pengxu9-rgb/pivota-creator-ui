const DEFAULT_SHOP_INVOKE_URL =
  "https://pivota-agent-production.up.railway.app/agent/shop/v1/invoke";
const DEFAULT_REVIEWS_UPSTREAM_BASE =
  "https://web-production-fedb.up.railway.app";

function sanitizeEnvValue(raw: string | undefined): string {
  const value = String(raw || "");
  const normalized = value
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .trim();
  return normalized.replace(/^['"]+|['"]+$/g, "").trim();
}

function firstNonEmpty(values: Array<string | undefined>): string {
  for (const value of values) {
    const normalized = sanitizeEnvValue(value);
    if (normalized) return normalized;
  }
  return "";
}

function toShopInvokeUrl(rawUrl: string): string {
  const value = sanitizeEnvValue(rawUrl);
  if (!value) return "";
  if (value.includes("/agent/shop/v1/invoke")) return value;
  if (value.includes("/agent/creator/v1/invoke")) {
    return value.replace("/agent/creator/v1/invoke", "/agent/shop/v1/invoke");
  }
  return value;
}

function stripInvokeSuffix(rawUrl: string): string {
  const value = sanitizeEnvValue(rawUrl);
  if (!value) return "";
  return value.replace(/\/agent\/(shop|creator)\/v1\/invoke\/?$/, "").replace(/\/$/, "");
}

function isProductionEnv(): boolean {
  const env = sanitizeEnvValue(process.env.NODE_ENV);
  return env === "production" || env === "prod";
}

export function getOptionalCreatorInvokeUrl(): string {
  const explicit = firstNonEmpty([
    process.env.PIVOTA_AGENT_URL,
    process.env.NEXT_PUBLIC_PIVOTA_AGENT_URL,
  ]);
  return toShopInvokeUrl(explicit);
}

export function getCreatorInvokeUrl(): string {
  const url = getOptionalCreatorInvokeUrl();
  if (!url) {
    throw new Error("PIVOTA_AGENT_URL (or NEXT_PUBLIC_PIVOTA_AGENT_URL) is not configured");
  }
  return url;
}

export function hasConfiguredCreatorInvokeUrl(): boolean {
  return Boolean(getOptionalCreatorInvokeUrl());
}

export function getCreatorInvokeUrlForClientFallback(): string {
  return getOptionalCreatorInvokeUrl() || DEFAULT_SHOP_INVOKE_URL;
}

export function getOptionalCreatorAgentBaseUrl(): string {
  const explicitBase = firstNonEmpty([process.env.PIVOTA_AGENT_BASE_URL]);
  if (explicitBase) return explicitBase.replace(/\/$/, "");

  const invokeUrl = getOptionalCreatorInvokeUrl();
  return stripInvokeSuffix(invokeUrl);
}

export function getCreatorAgentBaseUrl(): string {
  const base = getOptionalCreatorAgentBaseUrl();
  if (!base && isProductionEnv()) {
    throw new Error("PIVOTA_AGENT_BASE_URL (or PIVOTA_AGENT_URL) is not configured");
  }
  return base;
}

export function getCreatorAgentApiKey(): string {
  const key = firstNonEmpty([
    process.env.CREATOR_AGENT_API_KEY,
    process.env.PIVOTA_AGENT_API_KEY,
    process.env.PIVOTA_API_KEY,
    process.env.CREATOR_CHECKOUT_AGENT_API_KEY,
    process.env.NEXT_PUBLIC_AGENT_API_KEY,
    process.env.AGENT_API_KEY,
    process.env.SHOP_GATEWAY_AGENT_API_KEY,
  ]);
  if (!key && isProductionEnv()) {
    throw new Error("Creator agent API key is not configured");
  }
  return key;
}

export function getCreatorAgentAuthHeaders(): Record<string, string> {
  const key = getCreatorAgentApiKey();
  return key ? { "X-Agent-API-Key": key } : {};
}

export function getCreatorCheckoutInvokeUrl(): string {
  const explicit = firstNonEmpty([
    process.env.CREATOR_CHECKOUT_AGENT_URL,
    process.env.PIVOTA_SHOPPING_AGENT_URL,
    process.env.PIVOTA_SHOP_INVOKE_URL,
  ]);
  const fallback = getCreatorInvokeUrlForClientFallback();
  return toShopInvokeUrl(explicit || fallback);
}

export function getCreatorCheckoutAgentApiKey(): string {
  return firstNonEmpty([
    process.env.CREATOR_CHECKOUT_AGENT_API_KEY,
    process.env.CREATOR_AGENT_API_KEY,
    process.env.PIVOTA_AGENT_API_KEY,
    process.env.PIVOTA_API_KEY,
    process.env.NEXT_PUBLIC_AGENT_API_KEY,
    process.env.AGENT_API_KEY,
    process.env.SHOP_GATEWAY_AGENT_API_KEY,
  ]);
}

export function getCreatorCheckoutAuthHeaders(args?: {
  checkoutToken?: string | null;
}): Record<string, string> {
  const checkoutToken = sanitizeEnvValue(args?.checkoutToken ?? "");
  if (checkoutToken) return { "X-Checkout-Token": checkoutToken };
  const key = getCreatorCheckoutAgentApiKey();
  return key ? { "X-Agent-API-Key": key } : {};
}

export function getReviewsMediaBaseUrl(): string {
  return (
    firstNonEmpty([
      process.env.NEXT_PUBLIC_REVIEWS_UPSTREAM_BASE,
      process.env.NEXT_PUBLIC_REVIEWS_BASE,
      process.env.REVIEWS_UPSTREAM_BASE,
    ]) || DEFAULT_REVIEWS_UPSTREAM_BASE
  ).replace(/\/$/, "");
}
