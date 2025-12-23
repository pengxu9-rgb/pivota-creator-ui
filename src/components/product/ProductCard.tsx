'use client';

import type { Product } from "@/types/product";
import { useCart } from "@/components/cart/CartProvider";
import { Search, ShoppingCart } from "lucide-react";
import { useRef } from "react";

type Props = {
  product: Product;
  variant?: "default" | "compact";
  displayMode?: "default" | "deals";
  creatorName?: string;
  creatorId?: string;
  creatorSlug?: string;
  onSeeSimilar?: (product: Product) => void;
  onViewDetails?: (product: Product) => void;
};

function formatDealEndsAt(endAt: string | undefined): string | null {
  if (!endAt) return null;
  const ts = Date.parse(endAt);
  if (Number.isNaN(ts)) return null;
  const diffMs = ts - Date.now();
  if (diffMs <= 0) return "Ended";

  const diffMinutes = Math.ceil(diffMs / (60 * 1000));
  if (diffMinutes < 60) return `Ends in ${diffMinutes}m`;

  const diffHours = Math.ceil(diffMs / (60 * 60 * 1000));
  if (diffHours < 48) return `Ends in ${diffHours}h`;

  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return `Ends in ${diffDays}d`;
}

export function ProductCard({
  product,
  variant = "default",
  displayMode = "default",
  creatorName,
  creatorId,
  creatorSlug,
  onSeeSimilar,
  onViewDetails,
}: Props) {
  const { addItem } = useCart();
  const isCompact = variant === "compact";
  const lastTouchTsRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false);

  let creatorMeta: string | null = null;
  if (creatorName && product.fromCreatorDirectly) {
    creatorMeta = `From ${creatorName} looks`;
  } else if (
    creatorName &&
    typeof product.creatorMentions === "number" &&
    product.creatorMentions > 0
  ) {
    creatorMeta = `Appeared in ${creatorName}'s content ${product.creatorMentions} times`;
  }

  const isDealsMode = displayMode === "deals";
  const hasFlashPrice =
    !isDealsMode &&
    typeof product.bestDeal?.flashPrice === "number" &&
    product.bestDeal.flashPrice > 0;

  const handleCardClick = () => {
    if (onViewDetails) {
      onViewDetails(product);
    } else if (product.detailUrl) {
      window.open(product.detailUrl, "_blank", "noreferrer");
    }
  };

  const handleCardTouchStart: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const t = e.touches?.[0];
    if (!t) return;
    touchStartRef.current = { x: t.clientX, y: t.clientY };
    touchMovedRef.current = false;
  };

  const handleCardTouchMove: React.TouchEventHandler<HTMLDivElement> = (e) => {
    const start = touchStartRef.current;
    const t = e.touches?.[0];
    if (!start || !t) return;
    const dx = Math.abs(t.clientX - start.x);
    const dy = Math.abs(t.clientY - start.y);
    // If the user is scrolling, do not treat as a tap.
    if (dx > 10 || dy > 10) {
      touchMovedRef.current = true;
    }
  };

  const handleCardTouchEnd: React.TouchEventHandler<HTMLDivElement> = () => {
    if (touchMovedRef.current) return;
    lastTouchTsRef.current = Date.now();
    handleCardClick();
  };

  const handleCardClickSafe: React.MouseEventHandler<HTMLDivElement> = () => {
    // iOS Safari may fire a synthetic click right after touchend.
    if (Date.now() - lastTouchTsRef.current < 900) return;
    handleCardClick();
  };

  const safePrice =
    typeof product.price === "number" && !Number.isNaN(product.price)
      ? product.price
      : 0;

  const safeFlashPrice =
    typeof product.bestDeal?.flashPrice === "number" &&
    !Number.isNaN(product.bestDeal.flashPrice)
      ? product.bestDeal.flashPrice
      : null;

  const dealsLabel = (() => {
    if (!product.bestDeal) return null;
    if (product.bestDeal.label) return product.bestDeal.label;
    if (product.bestDeal.type === "FREE_SHIPPING" || product.bestDeal.freeShipping) {
      return "Free shipping";
    }
    if (typeof product.bestDeal.discountPercent === "number") {
      return `${product.bestDeal.discountPercent}% off`;
    }
    if (
      product.bestDeal.type === "MULTI_BUY_DISCOUNT" &&
      typeof product.bestDeal.thresholdQuantity === "number" &&
      product.bestDeal.thresholdQuantity > 0
    ) {
      return `Bundle deal (buy ${product.bestDeal.thresholdQuantity}+)`;
    }
    return null;
  })();

  const dealsEndsText = isDealsMode
    ? formatDealEndsAt(product.bestDeal?.endAt)
    : null;

  return (
    <div
      className={
        isCompact
          ? "group flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white shadow-[0_14px_34px_rgba(63,49,37,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_54px_rgba(63,49,37,0.16)]"
          : "group flex cursor-pointer flex-col overflow-hidden rounded-3xl bg-white shadow-[0_18px_40px_rgba(63,49,37,0.12)] transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_24px_70px_rgba(63,49,37,0.16)]"
      }
      role="button"
      tabIndex={0}
      onClick={handleCardClickSafe}
      onTouchStart={handleCardTouchStart}
      onTouchMove={handleCardTouchMove}
      onTouchEnd={handleCardTouchEnd}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className="relative aspect-[4/5] w-full bg-[#f5e3d4]">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        {product.bestDeal && (
          <div
            className={
              isCompact
                ? "absolute left-2 top-2 rounded-full bg-[#f6b59b] px-2 py-0.5 text-[9px] font-semibold text-white shadow"
                : "absolute left-2 top-2 rounded-full bg-[#f6b59b] px-2 py-0.5 text-[10px] font-semibold text-white shadow"
            }
          >
            {product.bestDeal.type === "MULTI_BUY_DISCOUNT"
              ? "Bundle & save"
              : product.bestDeal.type === "FREE_SHIPPING"
                ? "Free shipping"
                : "Flash deal"}
          </div>
        )}
        {onSeeSimilar && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSeeSimilar(product);
            }}
            onTouchEnd={(e) => e.stopPropagation()}
            className={
              isCompact
                ? "absolute bottom-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#3f3125]/80 text-white shadow-[0_0_0_1px_rgba(63,49,37,0.25),0_12px_30px_rgba(63,49,37,0.45)] backdrop-blur-md hover:bg-[#3f3125] md:translate-y-1 md:opacity-0 md:transition md:duration-200 md:group-hover:translate-y-0 md:group-hover:opacity-100"
                : "absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#3f3125]/80 px-3 py-1.5 text-[11px] font-medium text-white shadow-[0_0_0_1px_rgba(63,49,37,0.25),0_12px_30px_rgba(63,49,37,0.45)] backdrop-blur-md hover:bg-[#3f3125] md:translate-y-1 md:opacity-0 md:transition md:duration-200 md:group-hover:translate-y-0 md:group-hover:opacity-100"
            }
          >
            <Search className="h-3.5 w-3.5" />
            {!isCompact && <span>Find More</span>}
          </button>
        )}
      </div>
      <div
        className={
          isCompact
            ? "flex flex-1 flex-col px-3 pb-2.5 pt-2.5"
            : "flex flex-1 flex-col px-3 pb-3 pt-3"
        }
      >
        <div
          className={
            isCompact
              ? "line-clamp-2 text-[12px] font-semibold text-[#3f3125]"
              : "line-clamp-2 text-[13px] font-semibold text-[#3f3125]"
          }
        >
          {product.title}
        </div>
        {!isCompact && product.description && (
          <p className="mt-1 line-clamp-2 text-[11px] text-[#7b6550]">
            {product.description}
          </p>
        )}
        {!isCompact && creatorMeta && (
          <p className="mt-1 text-[10px] text-[#a38b78]">
            {creatorMeta}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              {hasFlashPrice && safeFlashPrice != null ? (
                <>
                  <span className="text-[11px] text-[#b29a84] line-through">
                    {product.currency} {safePrice.toFixed(2)}
                  </span>
                  <span
                    className={
                      isCompact
                        ? "text-[13px] font-semibold text-[#3f3125]"
                        : "text-sm font-semibold text-[#3f3125]"
                    }
                  >
                    {product.currency} {safeFlashPrice.toFixed(2)}
                  </span>
                </>
              ) : (
                <span
                  className={
                    isCompact
                      ? "text-[13px] font-semibold text-[#3f3125]"
                      : "text-sm font-semibold text-[#3f3125]"
                  }
                >
                  {product.currency} {safePrice.toFixed(2)}
                </span>
              )}
            </div>
            {((isDealsMode && dealsLabel) || (!isDealsMode && product.bestDeal?.label)) && (
              <span
                className={
                  isCompact
                    ? "text-[10px] font-medium text-[#f28b7a]"
                    : "text-[11px] font-medium text-[#f28b7a]"
                }
              >
                {isDealsMode ? `Est. ${dealsLabel}` : product.bestDeal?.label}
              </span>
            )}
            {isDealsMode && dealsEndsText && dealsEndsText !== "Ended" && (
              <span className="text-[10px] text-[#a38b78]">{dealsEndsText}</span>
            )}
            {isDealsMode && (
              <span className="text-[10px] text-[#a38b78]">
                Final price locked at checkout
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                addItem({
                  id: product.id,
                  productId: product.id,
                  merchantId: product.merchantId,
                  title: product.title,
                  price: product.price,
                  imageUrl: product.imageUrl,
                  quantity: 1,
                  currency: product.currency,
                  creatorId,
                  creatorSlug,
                  creatorName,
                  bestDeal: product.bestDeal ?? null,
                  allDeals: product.allDeals ?? null,
                });
              }}
              onTouchEnd={(e) => e.stopPropagation()}
              className={
                isCompact
                  ? "ml-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f6b59b] text-[11px] text-[#3f3125] shadow-sm hover:bg-[#f29b7f]"
                  : "ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f6b59b] text-[11px] text-[#3f3125] shadow-sm hover:bg-[#f29b7f]"
              }
            >
              <ShoppingCart className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
