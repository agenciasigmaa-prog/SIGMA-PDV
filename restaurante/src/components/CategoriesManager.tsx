import { Copy, GripVertical, ImageIcon, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableItem, type DragHandleProps } from "./SortableItem";
import type { Category, Product } from "../lib/menu";

function CategoryRow({
  category,
  productCount,
  onEdit,
  onDuplicate,
  onDelete,
  onManageAddons,
  dragHandleProps,
}: {
  category: Category;
  productCount: number;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onManageAddons: () => void;
  dragHandleProps?: DragHandleProps;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
      <button
        type="button"
        aria-label={`Arrastar ${category.name}`}
        className="touch-none cursor-grab rounded p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
        {...dragHandleProps?.attributes}
        {...dragHandleProps?.listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {category.image_url ? (
          <img src={category.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{category.name}</p>
          {category.allow_half_and_half && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              Meio a meio
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {productCount} produto{productCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="flex items-center gap-0.5">
        <button
          onClick={onManageAddons}
          className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Tag className="h-3.5 w-3.5" aria-hidden /> Adicionais
        </button>
        <button
          onClick={onEdit}
          aria-label={`Editar ${category.name}`}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
        <button
          onClick={onDuplicate}
          aria-label={`Duplicar ${category.name}`}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Copy className="h-4 w-4" aria-hidden />
        </button>
        <button
          onClick={onDelete}
          aria-label={`Excluir ${category.name}`}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function CategoriesManager({
  categories,
  products,
  onCreate,
  onEdit,
  onDuplicate,
  onDelete,
  onReorder,
  onManageAddons,
}: {
  categories: Category[];
  products: Product[];
  onCreate: () => void;
  onEdit: (category: Category) => void;
  onDuplicate: (category: Category) => void;
  onDelete: (category: Category) => void;
  onReorder: (orderedIds: string[]) => void;
  onManageAddons: (category: Category) => void;
}) {
  const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((c) => c.id === active.id);
    const newIndex = sorted.findIndex((c) => c.id === over.id);
    onReorder(arrayMove(sorted, oldIndex, newIndex).map((c) => c.id));
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold">Categorias</h3>
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105"
        >
          <Plus className="h-4 w-4" aria-hidden /> Nova categoria
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma categoria ainda.</p>
        </div>
      ) : (
        <div className="rounded-2xl bg-card p-5 shadow-card">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={sorted.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {sorted.map((category) => {
                const productCount = products.filter((p) => p.category_id === category.id).length;
                return (
                  <SortableItem key={category.id} id={category.id}>
                    {(handle) => (
                      <CategoryRow
                        category={category}
                        productCount={productCount}
                        onEdit={() => onEdit(category)}
                        onDuplicate={() => onDuplicate(category)}
                        onDelete={() => onDelete(category)}
                        onManageAddons={() => onManageAddons(category)}
                        dragHandleProps={handle}
                      />
                    )}
                  </SortableItem>
                );
              })}
            </SortableContext>
          </DndContext>
        </div>
      )}
    </div>
  );
}
