'use client';

function getInitial(label: string) {
  if (!label) return '?';
  return `${label.trim().charAt(0).toUpperCase()}*`;
}

function parsePrice(value?: string) {
  if (!value) return null;
  const match = String(value).match(/[\\d.]+/g);
  if (!match) return null;
  const num = Number(match.join(''));
  return Number.isFinite(num) ? num : null;
}

export function GenericRecentPurchases({
  items,
  showEmpty = false,
}: {
  items: Array<{
    user_label: string;
    variant_label?: string;
    time_label?: string;
    price_label?: string;
  }>;
  showEmpty?: boolean;
}) {
  const hasItems = items.length > 0;
  if (!hasItems && !showEmpty) return null;

  const displayItems = items;
  const displayCount = items.length;

  const prices = displayItems
    .map((item) => parsePrice(item.price_label))
    .filter((p) => p != null) as number[];
  const avgPrice = prices.length ? `$${(prices.reduce((acc, value) => acc + value, 0) / prices.length).toFixed(0)}` : null;

  return (
    <div className="mt-3 mx-3 border border-border rounded-lg overflow-hidden bg-card">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <h3 className="text-sm font-semibold">Recent Purchases ({displayCount})</h3>
        <span className="text-[10px] text-muted-foreground">{avgPrice ? `3-day avg ${avgPrice}` : '3-day avg --'}</span>
      </div>
      {displayItems.length ? (
        <div className="divide-y divide-border">
          {displayItems.slice(0, 3).map((purchase, idx) => (
            <div key={`${purchase.user_label}-${idx}`} className="flex items-center justify-between px-3 py-1.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[10px]">
                  {getInitial(purchase.user_label)}
                </div>
                <span className="text-muted-foreground">{purchase.variant_label || 'Variant'}</span>
              </div>
              <div className="flex items-center gap-3">
                <span>{purchase.price_label || '--'}</span>
                <span className="text-muted-foreground">{purchase.time_label || '--'}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-3 text-xs text-muted-foreground">No recent purchases yet.</div>
      )}
    </div>
  );
}
