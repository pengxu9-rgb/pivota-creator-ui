export type NormalizedCreatorPrice = {
  amount?: number;
  currency?: string;
  label?: string;
};

export const CREATOR_PRICE_FALLBACK_LABEL = "Price at checkout";

function readString(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  return undefined;
}

function readAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }
  return undefined;
}

export function hasNumericPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeCreatorPrice(raw: any): NormalizedCreatorPrice {
  const priceObject =
    raw?.price && typeof raw.price === "object" && !Array.isArray(raw.price)
      ? raw.price
      : null;
  const rawScalarPrice =
    raw?.price != null &&
    (typeof raw.price === "number" || typeof raw.price === "string")
      ? raw.price
      : undefined;

  const amount =
    readAmount(priceObject?.amount) ??
    readAmount(raw?.price_amount) ??
    readAmount(rawScalarPrice);
  const currency =
    readString(priceObject?.currency) ||
    readString(priceObject?.currency_code) ||
    readString(raw?.price_currency) ||
    readString(raw?.currency) ||
    readString(raw?.currency_code);
  const label = readString(priceObject?.label) || readString(raw?.price_label);

  return {
    ...(amount != null ? { amount } : {}),
    ...(currency ? { currency: currency.toUpperCase() } : {}),
    ...(label ? { label } : {}),
  };
}

export function mergeNormalizedPrices(
  primary: NormalizedCreatorPrice,
  fallback?: NormalizedCreatorPrice | null,
): NormalizedCreatorPrice {
  const backup = fallback || {};
  return {
    ...(primary.amount != null ? { amount: primary.amount } : backup.amount != null ? { amount: backup.amount } : {}),
    ...(primary.currency ? { currency: primary.currency } : backup.currency ? { currency: backup.currency } : {}),
    ...(primary.label ? { label: primary.label } : backup.label ? { label: backup.label } : {}),
  };
}

export function formatCreatorPriceAmount(amount: number, currency?: string | null): string {
  const normalizedCurrency = String(currency || "USD").trim().toUpperCase() || "USD";
  return `${normalizedCurrency} ${amount.toFixed(2)}`;
}

export function describeCreatorPrice(args: {
  amount?: number | null;
  currency?: string | null;
  label?: string | null;
  fallbackLabel?: string;
}): {
  kind: "amount" | "label" | "fallback";
  text: string;
} {
  if (hasNumericPrice(args.amount)) {
    return {
      kind: "amount",
      text: formatCreatorPriceAmount(args.amount, args.currency),
    };
  }

  const label = readString(args.label);
  if (label) {
    return {
      kind: "label",
      text: label,
    };
  }

  return {
    kind: "fallback",
    text: args.fallbackLabel || CREATOR_PRICE_FALLBACK_LABEL,
  };
}
