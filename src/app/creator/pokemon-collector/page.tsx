import { headers } from "next/headers";
import { notFound } from "next/navigation";
import LiveCollector from "@/components/creator/pokemon/live/LiveCollector";
import { previewOrigin } from "@/lib/pokemon/demoRuntime";
const { betaScope } = require("@/lib/pokemon/betaScope.cjs");

export const dynamic = "force-dynamic";
export const metadata = { title: "Pokémon Collector · Pivota Creator Agent" };
export default async function PokemonCreatorPage() {
  const origin = previewOrigin();
  if (!origin || (await headers()).get("host") !== new URL(origin).host)
    notFound();
  return <LiveCollector browsingBeta={!!betaScope()} />;
}
