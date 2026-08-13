import { Copy, GripVertical, ImageIcon, Pencil, Star, StarOff, Trash2 } from "lucide-react";
import type { DragHandleProps } from "./SortableItem";
import type { Product } from "../lib/menu";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProductGridCard({
  product,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
  onToggleSoldOut,
  onToggleMostOrdered,
  dragHandleProps,
}: {
  product: Product;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onToggleSoldOut: () => void;
  onToggleMostOrdered: () => void;
  dragHandleProps?: DragHandleProps;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-card">
      <div className="relative aspect-[4/3] bg-muted">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
        )}
        <button
          type="button"
          aria-label={`Arrastar ${product.name}`}
          className="touch-none absolute left-1.5 top-1.5 grid h-7 w-7 cursor-grab place-items-center rounded-full bg-background/90 text-muted-foreground shadow-xs active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
          disabled={!dragHandleProps}
          {...dragHandleProps?.attributes}
          {...dragHandleProps?.listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        <button
          onClick={onToggleMostOrdered}
          aria-label={product.most_ordered ? "Remover de mais pedidos" : "Marcar como mais pedido"}
          className={`absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-background/90 shadow-xs ${
            product.most_ordered ? "text-accent" : "text-muted-foreground"
          }`}
        >
          {product.most_ordered ? <Star className="h-4 w-4" aria-hidden /> : <StarOff className="h-4 w-4" aria-hidden />}
        </button>
      </div>

      <div className="space-y-2 p-3">
        <div>
          <p className="truncate text-sm font-medium">{product.name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{currency(product.price)}</span>
            {product.original_price != null && (
              <span className="line-through">{currency(product.original_price)}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          <button
            onClick={onToggleActive}
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              product.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
            }`}
          >
            {product.active ? "Ativo" : "Inativo"}
          </button>
          <button
            onClick={onToggleSoldOut}
            className={`rounded-full px-2.5 py-1 text-xs font-bold ${
              product.sold_out ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"
            }`}
          >
            Esgotado hoje
          </button>
        </div>

        <div className="flex items-center justify-end gap-0.5 border-t border-border pt-2">
          <button
            onClick={onEdit}
            aria-label={`Editar ${product.name}`}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
          <button
            onClick={onDuplicate}
            aria-label={`Duplicar ${product.name}`}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Copy className="h-4 w-4" aria-hidden />
          </button>
          <button
            onClick={onDelete}
            aria-label={`Excluir ${product.name}`}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
