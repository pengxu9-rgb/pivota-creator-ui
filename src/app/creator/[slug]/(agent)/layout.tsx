'use client';

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { getCreatorBySlug } from "@/config/creatorAgents";
import { CreatorAgentProvider } from "@/components/creator/CreatorAgentContext";
import { CreatorAgentLayout } from "@/components/creator/CreatorAgentLayout";

export default function CreatorSlugAgentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const params = useParams();
  const slugParam = (params as any)?.slug as string | string[] | undefined;
  const slug = Array.isArray(slugParam) ? slugParam[0] : slugParam;
  const creator = slug ? getCreatorBySlug(slug) : undefined;

  if (!creator) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-900">
        <div className="text-sm text-slate-500">Creator agent not found.</div>
      </main>
    );
  }

  return (
    <CreatorAgentProvider creator={creator}>
      <CreatorAgentLayout>{children}</CreatorAgentLayout>
    </CreatorAgentProvider>
  );
}

