import { Suspense } from "react";
import WriteReviewClient from "./WriteReviewClient";

export default function WriteReviewPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-sm text-muted-foreground">Loading…</div>
        </main>
      }
    >
      <WriteReviewClient />
    </Suspense>
  );
}

