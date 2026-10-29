import LiveCollector from "@/components/creator/pokemon/live/LiveCollector";
const { betaScope } = require("@/lib/pokemon/betaScope.cjs");
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  return (
    <LiveCollector
      view="card"
      cardId={decodeURIComponent((await params).cardId)}
      browsingBeta={!!betaScope()}
    />
  );
}
