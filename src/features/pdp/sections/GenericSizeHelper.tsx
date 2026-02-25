'use client';

import { Ruler } from 'lucide-react';

export function GenericSizeHelper() {
  return (
    <div className="mt-4 mx-3 border border-border rounded-lg p-2.5 bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Ruler className="h-4 w-4" />
          Size Helper
        </h3>
        <span className="text-xs text-muted-foreground cursor-default select-none" aria-disabled="true">
          AI Fit
        </span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">Add your height & weight for personalized size recommendations.</p>
    </div>
  );
}
