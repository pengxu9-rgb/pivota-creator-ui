'use client';

import type { Product } from "@/types/product";
import { useCart } from "@/components/cart/CartProvider";
import { Search } from "lucide-react";

type Props = {
  product: Product;
  creatorName?: string;
  creatorId?: string;
  creatorSlug?: string;
  onSeeSimilar?: (product: Product) => void;
  onViewDetails?: (product: Product) => void;
};

export function ProductCard({
  product,
  creatorName,
  creatorId,
  creatorSlug,
  onSeeSimilar,
  onViewDetails,
}: Props) {
  const { addItem } = useCart();

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

  const hasFlashPrice =
    typeof product.bestDeal?.flashPrice === "number" && product.bestDeal.flashPrice > 0;

  const handleCardClick = () => {
    if (onViewDetails) {
      onViewDetails(product);
    } else if (product.detailUrl) {
      window.open(product.detailUrl, "_blank", "noreferrer");
    }
  };

  return (
    <div
      className="group flex cursor-pointer flex-col rounded-3xl border border-[#f0e2d6] bg-[#fffaf5] p-3 shadow-[0_18px_40px_rgba(63,49,37,0.12)] transition-all duration-300 hover:-translate-y-1.5 hover:border-[#f6b59b] hover:bg-white hover:shadow-[0_24px_70px_rgba(63,49,37,0.16)]"
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-[#f5e3d4]">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        {product.bestDeal && (
          <div className="absolute left-2 top-2 rounded-full bg-[#f6b59b] px-2 py-0.5 text-[10px] font-semibold text-white shadow">
            {product.bestDeal.type === "MULTI_BUY_DISCOUNT" ? "Bundle & save" : "Flash deal"}
          </div>
        )}
        {onSeeSimilar && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSeeSimilar(product);
            }}
            className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-[#3f3125]/70 px-2.5 py-1 text-[10px] font-medium text-white shadow-[0_0_0_1px_rgba(63,49,37,0.25),0_12px_30px_rgba(63,49,37,0.45)] backdrop-blur-md hover:bg-[#3f3125]"
          >
            <Search className="h-3 w-3" />
            <span>Find More</span>
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-1 flex-col">
        <div className="line-clamp-2 text-[13px] font-semibold text-[#3f3125]">
          {product.title}
        </div>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-[12px] text-[#8c715c]">
            {product.description}
          </p>
        )}
        {creatorMeta && (
          <p className="mt-1 text-[10px] text-[#a38b78]">
            {creatorMeta}
          </p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              {hasFlashPrice ? (
                <>
                  <span className="text-[11px] text-[#b29a84] line-through">
                    {product.currency} {product.price.toFixed(2)}
                  </span>
                  <span className="text-sm font-semibold text-[#3f3125]">
                    {product.currency} {product.bestDeal?.flashPrice?.toFixed(2)}
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold text-[#3f3125]">
                  {product.currency} {product.price.toFixed(2)}
                </span>
              )}
            </div>
            {product.bestDeal?.label && (
              <span className="text-[10px] text-[#a38b78]">{product.bestDeal.label}</span>
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
              className="ml-2 rounded-full bg-[#3f3125] px-3 py-1 text-[10px] font-medium text-white shadow-sm hover:bg-black"
            >
              Add to cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
