export function normalizeMediaUrl(input?: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';

  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://')) return `https://${raw.slice('http://'.length)}`;

  return raw;
}

