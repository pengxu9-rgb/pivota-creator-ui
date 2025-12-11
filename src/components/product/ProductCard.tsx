'use client';

import type { Product } from "@/types/product";
import { useCart } from "@/components/cart/CartProvider";

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

  return (
    <div className="group flex flex-col rounded-3xl border border-slate-200 bg-white/90 p-2.5 shadow-[0_18px_45px_rgba(15,23,42,0.18)] transition-all duration-300 hover:-translate-y-2 hover:border-cyan-300 hover:bg-white hover:shadow-[0_24px_80px_rgba(15,23,42,0.26)]">
      <div className="relative overflow-hidden rounded-2xl bg-slate-100">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.title}
            className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        {product.bestDeal && (
          <div className="absolute left-2 top-2 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 px-2 py-0.5 text-[10px] font-semibold text-slate-950 shadow">
            {product.bestDeal.type === "MULTI_BUY_DISCOUNT" ? "Bundle & save" : "Flash deal"}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-1 flex-col">
        <div className="line-clamp-2 text-xs font-medium text-slate-900">
          {product.title}
        </div>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
            {product.description}
          </p>
        )}
        {creatorMeta && (
          <p className="mt-1 text-[10px] text-slate-400">
            {creatorMeta}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              {hasFlashPrice ? (
                <>
                  <span className="text-[11px] text-slate-400 line-through">
                    {product.currency} {product.price.toFixed(2)}
                  </span>
                  <span className="text-sm font-semibold text-slate-900">
                    {product.currency} {product.bestDeal?.flashPrice?.toFixed(2)}
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold text-slate-900">
                  {product.currency} {product.price.toFixed(2)}
                </span>
              )}
            </div>
            {product.bestDeal?.label && (
              <span className="text-[10px] text-slate-500">{product.bestDeal.label}</span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() =>
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
                })
              }
              className="ml-2 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-medium text-white shadow-sm hover:bg-slate-800"
            >
              Add to cart
            </button>
            {onSeeSimilar && (
              <button
                type="button"
                onClick={() => onSeeSimilar(product)}
                className="text-[10px] text-cyan-600 hover:text-cyan-500"
              >
                See similar
              </button>
            )}
            {(onViewDetails || product.detailUrl) && (
              onViewDetails ? (
                <button
                  type="button"
                  onClick={() => onViewDetails(product)}
                  className="text-[10px] text-cyan-600 hover:underline"
                >
                  View details
                </button>
              ) : (
                product.detailUrl && (
                  <a
                    href={product.detailUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-cyan-600 hover:underline"
                  >
                    View details
                  </a>
                )
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
