import { Clock, Minus, Plus, Star } from "lucide-react";
import type { Product } from "../lib/menu";
import type { ComboComponent } from "../lib/comboItems";

export function ProductCard({
  product,
  quantity,
  hasAddons,
  hasHalfAndHalf,
  hasComboChoice,
  comboItems,
  onAdd,
  onRemove,
}: {
  product: Product;
  quantity: number;
  hasAddons: boolean;
  hasHalfAndHalf?: boolean;
  hasComboChoice?: boolean;
  comboItems?: ComboComponent[];
  onAdd: () => void;
  onRemove: () => void;
}) {
  const discountPercent = product.original_price
    ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
    : null;

  return (
    <div className="group surface-card flex overflow-hidden md:block">
      <div className="relative aspect-square w-28 shrink-0 overflow-hidden bg-muted sm:w-32 md:aspect-[4/3] md:w-full">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-muted" />
        )}
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1">
          {discountPercent !== null && discountPercent > 0 && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground shadow-card">
              -{discountPercent}%
            </span>
          )}
          {product.most_ordered && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-foreground shadow-card">
              <Star className="h-3 w-3 fill-current" aria-hidden /> Mais pedido
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-1 text-sm font-semibold leading-snug md:text-base">{product.name}</h3>
        {product.description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground md:text-[13px]">
            {product.description}
          </p>
        )}
        {comboItems && comboItems.length > 0 && (
          <p className="line-clamp-2 text-[11px] text-muted-foreground">
            Inclui: {comboItems.map((item) => `${item.quantity}x ${item.name}`).join(", ")}
          </p>
        )}
        {product.prep_minutes != null && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden /> {product.prep_minutes} min
          </span>
        )}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span
              className={`text-base font-bold tracking-tight ${product.sold_out ? "text-muted-foreground" : "text-foreground"}`}
            >
              R$ {product.price.toFixed(2).replace(".", ",")}
            </span>
            {product.original_price && (
              <span className="text-xs text-muted-foreground line-through">
                R$ {product.original_price.toFixed(2).replace(".", ",")}
              </span>
            )}
          </div>
          {product.sold_out ? (
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground">
              Esgotado
            </span>
          ) : quantity > 0 && !hasAddons && !hasHalfAndHalf && !hasComboChoice ? (
            <div className="press flex items-center gap-2 rounded-full bg-primary/10 px-1 py-1">
              <button
                type="button"
                aria-label="Diminuir quantidade"
                onClick={onRemove}
                className="grid h-7 w-7 place-items-center rounded-full bg-white text-primary shadow-xs"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span className="min-w-[1ch] text-center text-sm font-bold">{quantity}</span>
              <button
                type="button"
                aria-label="Aumentar quantidade"
                onClick={onAdd}
                className="grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              className="press relative grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-card hover:brightness-105"
              aria-label={`Adicionar ${product.name}`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              {quantity > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground">
                  {quantity}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
