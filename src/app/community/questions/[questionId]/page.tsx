import { Suspense } from "react";
import QuestionThreadClient from "./QuestionThreadClient";

export const dynamic = "force-dynamic";

export default function QuestionThreadPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-mesh px-4 py-10">
          <div className="max-w-2xl mx-auto text-sm text-muted-foreground">
            Loading discussion…
          </div>
        </div>
      }
    >
      <QuestionThreadClient />
    </Suspense>
  );
}

