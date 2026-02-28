import { redirect } from "next/navigation";

function sanitizeBaseUrl(raw: string | undefined): string {
  const value = String(raw || "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "")
    .trim()
    .replace(/^['\"]+|['\"]+$/g, "")
    .replace(/\/$/, "");
  return value;
}

function appendSearchParam(target: URL, key: string, value: string | string[] | undefined) {
  if (typeof value === "string") {
    if (value) target.searchParams.append(key, value);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string" && item) {
      target.searchParams.append(key, item);
    }
  }
}

export default async function CreatorProductAliasPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; productId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, productId } = await params;
  const query = (await searchParams) || {};

  const standardPdpBase =
    sanitizeBaseUrl(process.env.CREATOR_STANDARD_PDP_BASE_URL) ||
    sanitizeBaseUrl(process.env.NEXT_PUBLIC_CREATOR_STANDARD_PDP_BASE_URL) ||
    "https://agent.pivota.cc";

  const target = new URL(`/products/${encodeURIComponent(productId)}`, `${standardPdpBase}/`);

  for (const [key, value] of Object.entries(query)) {
    appendSearchParam(target, key, value);
  }

  if (!target.searchParams.has("creator_slug") && slug) {
    target.searchParams.set("creator_slug", slug);
  }
  if (!target.searchParams.has("entry_point")) {
    target.searchParams.set("entry_point", "creator_pdp_alias");
  }

  redirect(target.toString());
}
