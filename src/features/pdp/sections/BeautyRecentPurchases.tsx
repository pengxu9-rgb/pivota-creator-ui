'use client';

import { useEffect, useMemo, useState } from 'react';

export function BeautyRecentPurchases({
  items,
  showEmpty = false,
}: {
  items: Array<{ user_label: string; variant_label?: string; time_label?: string }>;
  showEmpty?: boolean;
}) {
  const mockData = useMemo(() => {
    const names = ['Ava', 'Mia', 'Luna', 'Chloe', 'Sofia', 'Zoe', 'Nora'];
    const variants = ['Rose', 'Nude', 'Honey', 'Coral', 'Mocha', 'Peach'];
    const times = ['Just now', '5m ago', '12m ago', '1h ago', '3h ago', 'Yesterday'];
    const count = Math.floor(Math.random() * 20) + 1;
    const list = Array.from({ length: Math.min(3, count) }).map((_, idx) => ({
      user_label: `${names[idx % names.length]} •••`,
      variant_label: variants[idx % variants.length],
      time_label: times[idx % times.length],
    }));
    return { count, list };
  }, []);

  const hasItems = items.length > 0;

  const displayItemsRaw = hasItems ? items : mockData.list;
  const DEFAULT_VISIBLE = 3;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setExpanded(false);
  }, [displayItemsRaw.length]);

  if (!hasItems && !showEmpty) return null;

  const displayItems = expanded ? displayItemsRaw : displayItemsRaw.slice(0, DEFAULT_VISIBLE);
  const displayCount = hasItems ? items.length : mockData.count;
  const canToggle = displayItemsRaw.length > DEFAULT_VISIBLE;

  return (
    <div className="mt-4 px-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Recent Purchases ({displayCount})</h3>
        {canToggle ? (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? 'Collapse' : 'View all →'}
          </button>
        ) : null}
      </div>
      {displayItems.length ? (
        <div className="space-y-1">
          {displayItems.map((purchase, idx) => (
            <div key={`${purchase.user_label}-${idx}`} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-gradient-to-br from-pink-400 to-rose-500" />
                <span className="text-muted-foreground">{purchase.user_label}</span>
                {purchase.variant_label ? <span>bought {purchase.variant_label}</span> : null}
              </div>
              {purchase.time_label ? <span className="text-xs text-muted-foreground">{purchase.time_label}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card px-3 py-3 text-xs text-muted-foreground">
          No recent activity yet.
        </div>
      )}
    </div>
  );
}
