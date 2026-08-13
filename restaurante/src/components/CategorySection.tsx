import { ImageIcon, Plus } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { ProductRow } from "./ProductRow";
import { ProductGridCard } from "./ProductGridCard";
import { SortableItem } from "./SortableItem";
import type { Product } from "../lib/menu";

export function CategorySection({
  title,
  imageUrl,
  products,
  view,
  dragEnabled,
  onAddProduct,
  onEditProduct,
  onDuplicateProduct,
  onDeleteProduct,
  onReorder,
  onToggleProductActive,
  onToggleProductSoldOut,
  onToggleProductMostOrdered,
}: {
  title: string;
  imageUrl: string | null;
  products: Product[];
  view: "list" | "grid";
  dragEnabled: boolean;
  onAddProduct: () => void;
  onEditProduct: (product: Product) => void;
  onDuplicateProduct: (product: Product) => void;
  onDeleteProduct: (product: Product) => void;
  onReorder: (orderedIds: string[]) => void;
  onToggleProductActive: (product: Product) => void;
  onToggleProductSoldOut: (product: Product) => void;
  onToggleProductMostOrdered: (product: Product) => void;
}) {
  const sortedProducts = [...products].sort((a, b) => a.sort_order - b.sort_order);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedProducts.findIndex((p) => p.id === active.id);
    const newIndex = sortedProducts.findIndex((p) => p.id === over.id);
    onReorder(arrayMove(sortedProducts, oldIndex, newIndex).map((p) => p.id));
  }

  function renderItem(product: Product, dragHandleProps?: Parameters<typeof ProductRow>[0]["dragHandleProps"]) {
    const commonProps = {
      product,
      onEdit: () => onEditProduct(product),
      onDuplicate: () => onDuplicateProduct(product),
      onDelete: () => onDeleteProduct(product),
      onToggleActive: () => onToggleProductActive(product),
      onToggleSoldOut: () => onToggleProductSoldOut(product),
      onToggleMostOrdered: () => onToggleProductMostOrdered(product),
      dragHandleProps,
    };
    return view === "grid" ? <ProductGridCard {...commonProps} /> : <ProductRow {...commonProps} />;
  }

  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
        </div>
        <h3 className="flex-1 text-base font-bold">
          {title} <span className="font-normal text-muted-foreground">· {products.length} produto{products.length === 1 ? "" : "s"}</span>
        </h3>

        <button
          onClick={onAddProduct}
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Produto
        </button>
      </div>

      {sortedProducts.length === 0 ? (
        <p className="border-t border-border py-4 text-center text-xs text-muted-foreground">
          Nenhum produto nesta categoria ainda.
        </p>
      ) : !dragEnabled ? (
        <div className={view === "grid" ? "grid grid-cols-2 gap-3 pt-3 md:grid-cols-3 lg:grid-cols-4" : undefined}>
          {sortedProducts.map((product) => (
            <div key={product.id}>{renderItem(product)}</div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={sortedProducts.map((p) => p.id)}
            strategy={view === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
          >
            <div className={view === "grid" ? "grid grid-cols-2 gap-3 pt-3 md:grid-cols-3 lg:grid-cols-4" : undefined}>
              {sortedProducts.map((product) => (
                <SortableItem key={product.id} id={product.id}>
                  {(handle) => renderItem(product, handle)}
                </SortableItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
