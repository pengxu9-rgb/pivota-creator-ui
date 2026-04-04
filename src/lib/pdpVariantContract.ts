type VariantContractLike = {
  status?: string | null;
  is_complete?: boolean | null;
  root_cause_category?: string | null;
  anomaly_types?: string[] | null;
  source_variant_count?: number | null;
  final_variant_count?: number | null;
};

type EvaluateArgs = {
  pdpPayload: any;
  raw?: any;
};

export type ExternalSeedPdpVariantContract = {
  status: "ok" | "degraded";
  isComplete: boolean;
  rootCauseCategory: string | null;
  anomalyTypes: string[];
  sourceVariantCount: number | null;
  payloadVariantCount: number;
  defaultVariantId: string | null;
  upstreamProvided: boolean;
};

const DEFAULT_VARIANT_TITLE_RE = /^(default(?:\s+title)?|variant\s*\d+|untitled)$/i;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function normalizeContract(raw: unknown): VariantContractLike | null {
  const base = isRecord(raw) ? raw : null;
  if (!base) return null;
  const anomalyTypes = [
    ...(Array.isArray((base as any).anomaly_types) ? (base as any).anomaly_types : []),
    ...(Array.isArray((base as any).anomalyTypes) ? (base as any).anomalyTypes : []),
  ]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const status = pickString((base as any).status) || null;
  const isComplete =
    typeof (base as any).is_complete === "boolean"
      ? Boolean((base as any).is_complete)
      : typeof (base as any).isComplete === "boolean"
        ? Boolean((base as any).isComplete)
        : status === "ok"
          ? true
          : status === "degraded"
            ? false
            : null;
  const rootCauseCategory = pickString((base as any).root_cause_category, (base as any).rootCauseCategory) || null;
  const sourceVariantCount = Number.isFinite(Number((base as any).source_variant_count ?? (base as any).sourceVariantCount))
    ? Math.max(0, Math.trunc(Number((base as any).source_variant_count ?? (base as any).sourceVariantCount)))
    : null;
  const finalVariantCount = Number.isFinite(Number((base as any).final_variant_count ?? (base as any).finalVariantCount))
    ? Math.max(0, Math.trunc(Number((base as any).final_variant_count ?? (base as any).finalVariantCount)))
    : null;

  if (!status && isComplete == null && !rootCauseCategory && !anomalyTypes.length && sourceVariantCount == null && finalVariantCount == null) {
    return null;
  }

  return {
    status,
    is_complete: isComplete,
    root_cause_category: rootCauseCategory,
    anomaly_types: anomalyTypes,
    source_variant_count: sourceVariantCount,
    final_variant_count: finalVariantCount,
  };
}

function getPayloadProduct(payload: any) {
  return isRecord(payload?.product) ? payload.product : null;
}

function getPayloadVariants(payload: any) {
  const product = getPayloadProduct(payload);
  return Array.isArray(product?.variants) ? product.variants : [];
}

function getRawCanonicalPayload(raw: any) {
  const modules = Array.isArray(raw?.modules) ? raw.modules : [];
  const canonical = modules.find((item: any) => isRecord(item) && item.type === "canonical");
  const canonicalData = isRecord((canonical as any)?.data) ? (canonical as any).data : null;
  return isRecord(canonicalData?.pdp_payload) ? canonicalData.pdp_payload : null;
}

function hasMeaningfulOptionValues(variant: any) {
  if (Array.isArray(variant?.options)) {
    return variant.options.some((item: any) => {
      const name = pickString(item?.name).toLowerCase();
      const value = pickString(item?.value);
      return Boolean(name && value && !/^default(?:\s+title)?$/i.test(value));
    });
  }
  if (isRecord(variant?.options)) {
    return Object.entries(variant.options).some(([name, value]) => {
      const normalizedName = pickString(name).toLowerCase();
      const normalizedValue = pickString(value);
      return Boolean(normalizedName && normalizedValue && !/^default(?:\s+title)?$/i.test(normalizedValue));
    });
  }
  return false;
}

function isSyntheticDefaultLikeVariant(variant: any, productId = "") {
  const title = pickString(variant?.title);
  const variantId = pickString(variant?.variant_id, variant?.id);
  const sku = pickString(variant?.sku_id, variant?.sku);
  if (hasMeaningfulOptionValues(variant)) return false;
  if (title && !DEFAULT_VARIANT_TITLE_RE.test(title)) return false;
  if (/^seed-variant-\d+$/i.test(variantId)) return true;
  if (productId && variantId && variantId === productId && (!sku || sku === variantId)) return true;
  return DEFAULT_VARIANT_TITLE_RE.test(title || "Default");
}

export function evaluateExternalSeedPdpVariantContract(args: EvaluateArgs): ExternalSeedPdpVariantContract {
  const payload = isRecord(args?.pdpPayload) ? args.pdpPayload : null;
  const raw = isRecord(args?.raw) ? args.raw : null;
  const product = getPayloadProduct(payload);
  const variants = getPayloadVariants(payload);
  const defaultVariantId = pickString(product?.default_variant_id, product?.defaultVariantId) || null;
  const canonicalPayload = getRawCanonicalPayload(raw);
  const canonicalVariants = getPayloadVariants(canonicalPayload);
  const upstreamContract =
    normalizeContract(product?.variant_contract)
    || normalizeContract(raw?.metadata?.variant_contract)
    || normalizeContract(canonicalPayload?.product?.variant_contract);
  const variantsComplete =
    typeof product?.variants_complete === "boolean"
      ? product.variants_complete
      : typeof product?.variantsComplete === "boolean"
        ? product.variantsComplete
        : upstreamContract?.is_complete;

  const degraded = (rootCauseCategory: string | null, anomalyTypes: string[] = []) => ({
    status: "degraded" as const,
    isComplete: false,
    rootCauseCategory,
    anomalyTypes,
    sourceVariantCount:
      upstreamContract?.source_variant_count
      ?? upstreamContract?.final_variant_count
      ?? (canonicalVariants.length || null),
    payloadVariantCount: variants.length,
    defaultVariantId,
    upstreamProvided: Boolean(upstreamContract),
  });

  if (upstreamContract?.is_complete === false) {
    return degraded(
      upstreamContract.root_cause_category || "seed_source_missing_variants",
      Array.isArray(upstreamContract.anomaly_types) ? upstreamContract.anomaly_types : [],
    );
  }

  if (!product || !variants.length || !defaultVariantId) {
    return degraded("pdp_proxy_adapter_dropped_variants", ["missing_pdp_variant_payload"]);
  }

  if (canonicalVariants.length > variants.length && canonicalVariants.length > 1) {
    return degraded("pdp_proxy_adapter_dropped_variants", ["canonical_variants_lost_in_proxy"]);
  }

  if (variants.length > 1) {
    const hasAnyOptions = variants.some((variant: any) => hasMeaningfulOptionValues(variant));
    if (!hasAnyOptions) {
      return degraded(
        variantsComplete === false ? "canonical_normalization_dropped_variants" : "pdp_proxy_adapter_dropped_variants",
        ["missing_option_values"],
      );
    }
    return {
      status: "ok",
      isComplete: true,
      rootCauseCategory: null,
      anomalyTypes: [],
      sourceVariantCount:
        upstreamContract?.source_variant_count
        ?? upstreamContract?.final_variant_count
        ?? variants.length,
      payloadVariantCount: variants.length,
      defaultVariantId,
      upstreamProvided: Boolean(upstreamContract),
    };
  }

  const onlyVariant = variants[0];
  if (!isSyntheticDefaultLikeVariant(onlyVariant, pickString(product?.product_id))) {
    return {
      status: "ok",
      isComplete: true,
      rootCauseCategory: null,
      anomalyTypes: [],
      sourceVariantCount:
        upstreamContract?.source_variant_count
        ?? upstreamContract?.final_variant_count
        ?? 1,
      payloadVariantCount: 1,
      defaultVariantId,
      upstreamProvided: Boolean(upstreamContract),
    };
  }

  return degraded(
    variantsComplete === false ? "canonical_normalization_dropped_variants" : "pdp_proxy_adapter_dropped_variants",
    ["default_only_fake_variants"],
  );
}
