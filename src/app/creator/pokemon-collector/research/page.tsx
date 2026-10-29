import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { previewOrigin } from "@/lib/pokemon/demoRuntime";
import ManualResearch from "@/components/creator/pokemon/live/ManualResearch";
const { manualResearchEnabled } = require("@/lib/pokemon/syntheticDemo.cjs");
export const dynamic = "force-dynamic";
export const metadata = { title: "Pot · Listing evidence" };
export default async function Page() {
  const origin = previewOrigin();
  if (!manualResearchEnabled() || !origin || (await headers()).get("host") !== new URL(origin).host) notFound();
  return <ManualResearch />;
}
