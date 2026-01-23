'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import type { Offer, Price } from '@/features/pdp/types';
import { cn } from '@/lib/utils';

function formatPrice(amount: number, currency: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const c = currency || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(n);
  } catch {
    return `${c} ${n.toFixed(2)}`;
  }
}

function totalPrice(price: Price, shippingCost?: Price): number {
  const base = Number(price?.amount) || 0;
  const ship = Number(shippingCost?.amount) || 0;
  return base + ship;
}

export function OfferSheet({
  open,
  offers,
  selectedOfferId,
  defaultOfferId,
  bestPriceOfferId,
  onSelect,
  onClose,
}: {
  open: boolean;
  offers: Offer[];
  selectedOfferId: string | null;
  defaultOfferId?: string;
  bestPriceOfferId?: string;
  onSelect: (offerId: string) => void;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const sortedOffers = useMemo(() => {
    return [...offers].sort((a, b) => {
      const aTotal = totalPrice(a.price, a.shipping?.cost);
      const bTotal = totalPrice(b.price, b.shipping?.cost);
      return aTotal - bTotal;
    });
  }, [offers]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[2147483647]">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close offers"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0">
        <div className="mx-auto max-w-md">
          <div className="rounded-t-3xl border border-border bg-white shadow-[0_-16px_40px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold">Offers</div>
              <button
                type="button"
                className="h-8 w-8 rounded-full border border-border bg-white flex items-center justify-center text-lg leading-none"
                onClick={onClose}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="px-4 py-4 space-y-3">
              {sortedOffers.map((offer) => {
                const isSelected = offer.offer_id === selectedOfferId;
                const isDefault = defaultOfferId && offer.offer_id === defaultOfferId;
                const isBestPrice = bestPriceOfferId && offer.offer_id === bestPriceOfferId;
                const total = totalPrice(offer.price, offer.shipping?.cost);
                const currency = offer.price.currency || 'USD';
                const eta = offer.shipping?.eta_days_range;
                const returns = offer.returns;
                const sellerLabel = offer.merchant_name || offer.merchant_id;

                return (
                  <button
                    key={offer.offer_id}
                    type="button"
                    className={cn(
                      'w-full rounded-2xl border px-4 py-3 text-left transition-colors',
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                        : 'border-border bg-white hover:bg-muted/30',
                    )}
                    onClick={() => onSelect(offer.offer_id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-sm font-semibold truncate">{sellerLabel}</div>
                          {isDefault ? (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                              Recommended
                            </span>
                          ) : null}
                          {isBestPrice ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                              Best price
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                          {eta?.length === 2 ? (
                            <span>
                              {offer.shipping?.method_label ? `${offer.shipping.method_label} · ` : ''}
                              {eta[0]}–{eta[1]} days
                            </span>
                          ) : null}
                          {returns?.return_window_days ? (
                            <span>
                              {returns.free_returns ? 'Free returns' : 'Returns'} · {returns.return_window_days} days
                            </span>
                          ) : null}
                        </div>
                        {offer.shipping?.cost ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            Shipping:{' '}
                            {formatPrice(
                              Number(offer.shipping.cost.amount) || 0,
                              offer.shipping.cost.currency || currency,
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold">{formatPrice(total, currency)}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Item: {formatPrice(Number(offer.price.amount) || 0, currency)}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

