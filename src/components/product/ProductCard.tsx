'use client';

import type { Product } from "@/types/product";
import { useCart } from "@/components/cart/CartProvider";

type Props = {
  product: Product;
  creatorName?: string;
};

export function ProductCard({ product, creatorName }: Props) {
  const priceLabel = `${product.currency} ${product.price.toFixed(0)}`;
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
        {typeof product.discountPercent === "number" && product.discountPercent > 0 && (
          <div className="absolute left-2 top-2 rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold text-slate-950">
            -{product.discountPercent}%
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
          <span className="text-sm font-semibold text-slate-900">
            {priceLabel}
          </span>
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
              })
            }
            className="ml-2 rounded-full bg-slate-900 px-3 py-1 text-[10px] font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Add to cart
          </button>
          {product.detailUrl && (
            <a
              href={product.detailUrl}
              target="_blank"
              rel="noreferrer"
            className="text-[10px] text-cyan-600 hover:underline"
          >
            View details
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
