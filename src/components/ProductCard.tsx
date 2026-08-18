import { Star } from "lucide-react";
import type { Product } from "../lib/menu";
import type { ComboComponent } from "../lib/comboItems";

// Linha de lista compacta, estilo iFood: texto (nome, descrição, preço) à
// esquerda, foto pequena à direita. Tocar em qualquer parte da linha abre a
// ficha do produto (ProductDetailSheet) — é lá que a quantidade é ajustada e
// o item entra no carrinho, não tem mais botão de +/- direto na lista.
export function ProductCard({
  product,
  quantity,
  comboItems,
  onOpenDetail,
}: {
  product: Product;
  quantity: number;
  comboItems?: ComboComponent[];
  onOpenDetail: () => void;
}) {
  const discountPercent = product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : null;

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      aria-label={`Ver ${product.name}`}
      disabled={product.sold_out}
      className="press flex w-full items-start justify-between gap-3 border-b border-border py-4 text-left last:border-b-0 disabled:opacity-60"
    >
      <div className="min-w-0 flex-1">
        {product.most_ordered && (
          <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold text-accent">
            <Star className="h-3 w-3 fill-current" aria-hidden /> Mais pedido
          </span>
        )}
        <h3 className="line-clamp-1 text-base font-bold leading-snug">{product.name}</h3>
        {product.description && (
          <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
        )}
        {comboItems && comboItems.length > 0 && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            Inclui: {comboItems.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
          </p>
        )}
        <div className="mt-1.5 flex items-baseline gap-2">
          {product.sold_out ? (
            <span className="text-sm font-bold text-muted-foreground">Esgotado</span>
          ) : (
            <>
              {discountPercent !== null && discountPercent > 0 && (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">
                  -{discountPercent}%
                </span>
              )}
              <span className="text-base font-bold tracking-tight">R$ {product.price.toFixed(2).replace(".", ",")}</span>
              {product.original_price && (
                <span className="text-xs text-muted-foreground line-through">
                  R$ {product.original_price.toFixed(2).replace(".", ",")}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
        {product.image_url ? (
          <img src={product.image_url} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
        {quantity > 0 && (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground shadow-card">
            {quantity}
          </span>
        )}
      </div>
    </button>
  );
}
