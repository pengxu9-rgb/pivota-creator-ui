import LiveCollector from "@/components/creator/pokemon/live/LiveCollector";
const { betaScope } = require("@/lib/pokemon/betaScope.cjs");
export const dynamic = "force-dynamic";
export default function Page() {
  return <LiveCollector view="collection" browsingBeta={!!betaScope()} />;
}
