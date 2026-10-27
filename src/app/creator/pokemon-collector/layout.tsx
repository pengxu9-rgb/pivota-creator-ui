import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { previewOrigin } from "@/lib/pokemon/demoRuntime";
import { PreviewProvider } from "@/components/creator/pokemon/PreviewContext";
const { cloudTestScope } = require("@/lib/pokemon/cloudTestScope.cjs");
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const origin = previewOrigin();
  if (!origin || (await headers()).get("host") !== new URL(origin).host)
    notFound();
  return (
    <Suspense fallback={<p>Connecting to your catalog…</p>}>
      <PreviewProvider
        environment={cloudTestScope() ? "google-cloud-test" : "local"}
      >
        {children}
      </PreviewProvider>
    </Suspense>
  );
}
