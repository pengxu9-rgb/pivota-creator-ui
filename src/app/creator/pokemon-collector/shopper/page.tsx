import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { previewOrigin } from "@/lib/pokemon/demoRuntime";
import MobileAgent from "@/components/creator/pokemon/shopper/MobileAgent";
export const dynamic = "force-dynamic";
export const metadata = { title: "Pot · Your card agent" };
export default async function Page() {
  const origin = previewOrigin();
  if (!origin || (await headers()).get("host") !== new URL(origin).host) notFound();
  const beta=!!require("@/lib/pokemon/betaScope.cjs").betaScope();
  return <MobileAgent browsingBeta={beta} />;
}
