import { headers } from "next/headers";
import LegacyCheckoutClient from "@/app/checkout/LegacyCheckoutClient";

export const dynamic = "force-dynamic";

type SearchParamsShape = Record<string, string | string[] | undefined>;

function readSearchParam(
  params: SearchParamsShape,
  key: string,
): string | null {
  const value = params[key];
  if (Array.isArray(value)) {
    const first = String(value[0] || "").trim();
    return first || null;
  }
  const normalized = String(value || "").trim();
  return normalized || null;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParamsShape>;
}) {
  const params = (await searchParams) || {};
  const requestHeaders = await headers();
  const orderId =
    readSearchParam(params, "orderId") ||
    readSearchParam(params, "order_id");
  const creatorSlug =
    readSearchParam(params, "creatorSlug") ||
    readSearchParam(params, "creator_slug") ||
    readSearchParam(params, "creator");

  console.warn("[creator][legacy-checkout-request]", {
    route: "/checkout",
    orderId,
    creatorSlug,
    search: new URLSearchParams(
      Object.entries(params).flatMap(([key, value]) =>
        Array.isArray(value)
          ? value.filter(Boolean).map((item) => [key, String(item)])
          : value
            ? [[key, String(value)]]
            : [],
      ),
    ).toString() || null,
    referer: requestHeaders.get("referer") || null,
    userAgent: requestHeaders.get("user-agent") || null,
    ts: new Date().toISOString(),
  });

  return <LegacyCheckoutClient />;
}
