import { Copy, GripVertical, ImageIcon, Pencil, Star, StarOff, Trash2 } from "lucide-react";
import type { DragHandleProps } from "./SortableItem";
import type { Product } from "../lib/menu";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProductRow({
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
    <div className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
      <button
        type="button"
        aria-label={`Arrastar ${product.name}`}
        className="touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-30"
        disabled={!dragHandleProps}
        {...dragHandleProps?.attributes}
        {...dragHandleProps?.listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {product.image_url ? (
          <img src={product.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{currency(product.price)}</span>
          {product.original_price != null && (
            <span className="line-through">{currency(product.original_price)}</span>
          )}
          {product.prep_minutes != null && <span>{product.prep_minutes} min</span>}
        </div>
      </div>

      <button
        onClick={onToggleMostOrdered}
        aria-label={product.most_ordered ? "Remover de mais pedidos" : "Marcar como mais pedido"}
        className={`rounded-full p-1.5 hover:bg-muted ${product.most_ordered ? "text-accent" : "text-muted-foreground"}`}
      >
        {product.most_ordered ? <Star className="h-4 w-4" aria-hidden /> : <StarOff className="h-4 w-4" aria-hidden />}
      </button>

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

      <div className="flex items-center gap-0.5">
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
  );
}
