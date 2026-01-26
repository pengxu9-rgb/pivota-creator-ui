import { Suspense } from "react";
import QuestionsListClient from "./QuestionsListClient";

export const dynamic = "force-dynamic";

export default function QuestionsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-mesh px-4 py-10">
          <div className="max-w-2xl mx-auto text-sm text-muted-foreground">
            Loading questions…
          </div>
        </div>
      }
    >
      <QuestionsListClient />
    </Suspense>
  );
}

