import type { Product } from "@/types/product";

type Props = {
  product: Product;
  creatorName?: string;
};

export function ProductCard({ product, creatorName }: Props) {
  const priceLabel = `${product.currency} ${product.price.toFixed(0)}`;

  let creatorMeta: string | null = null;
  if (creatorName && product.fromCreatorDirectly) {
    creatorMeta = `来自 ${creatorName} 穿搭`;
  } else if (
    creatorName &&
    typeof product.creatorMentions === "number" &&
    product.creatorMentions > 0
  ) {
    creatorMeta = `出现在 ${creatorName} 内容中 ${product.creatorMentions} 次`;
  }

  return (
    <div className="group flex flex-col rounded-3xl border border-white/10 bg-white/5 p-2.5 shadow-[0_18px_45px_rgba(0,0,0,0.6)] transition-all duration-300 hover:-translate-y-2 hover:border-cyan-400/70 hover:bg-white/10 hover:shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
      <div className="relative overflow-hidden rounded-2xl bg-slate-900">
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
        <div className="line-clamp-2 text-xs font-medium text-slate-100">{product.title}</div>
        {product.description && (
          <p className="mt-1 line-clamp-2 text-[11px] text-slate-400">{product.description}</p>
        )}
        {creatorMeta && <p className="mt-1 text-[10px] text-slate-400">{creatorMeta}</p>}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-50">{priceLabel}</span>
          {product.detailUrl && (
            <a
              href={product.detailUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-cyan-400 hover:underline"
            >
              查看详情
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
