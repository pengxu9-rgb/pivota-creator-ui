const DEFAULT_REVIEWS_MEDIA_BASE = "https://web-production-fedb.up.railway.app";

function sanitizeBase(raw: string | undefined): string {
  const value = String(raw || "");
  return value
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/$/, "");
}

function getReviewsMediaBaseUrl(): string {
  const explicit = sanitizeBase(
    process.env.NEXT_PUBLIC_REVIEWS_UPSTREAM_BASE ||
      process.env.NEXT_PUBLIC_REVIEWS_BASE,
  );
  if (explicit) return explicit;

  const agentInvoke = sanitizeBase(process.env.NEXT_PUBLIC_PIVOTA_AGENT_URL);
  if (agentInvoke) {
    return agentInvoke.replace(/\/agent\/(shop|creator)\/v1\/invoke\/?$/, "");
  }

  return DEFAULT_REVIEWS_MEDIA_BASE;
}

export function normalizeMediaUrl(input?: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';

  if (raw.startsWith('/agent/shop/v1/review-media/') || raw.startsWith('/agent/creator/v1/review-media/')) {
    return `${getReviewsMediaBaseUrl()}${raw}`;
  }
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://')) return `https://${raw.slice('http://'.length)}`;

  return raw;
}
