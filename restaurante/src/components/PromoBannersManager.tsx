import { ChevronDown, ChevronUp, ImageIcon, Pencil, Plus, Trash2 } from "lucide-react";
import type { PromoBanner } from "../lib/promoBanners";
import type { Category } from "../lib/menu";

export function PromoBannersManager({
  banners,
  categories,
  onCreate,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleActive,
}: {
  banners: PromoBanner[];
  categories: Category[];
  onCreate: () => void;
  onEdit: (banner: PromoBanner) => void;
  onDelete: (banner: PromoBanner) => void;
  onMoveUp: (banner: PromoBanner) => void;
  onMoveDown: (banner: PromoBanner) => void;
  onToggleActive: (banner: PromoBanner) => void;
}) {
  const sorted = [...banners].sort((a, b) => a.sort_order - b.sort_order);
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold">Banners</h3>
        <button
          onClick={onCreate}
          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105"
        >
          <Plus className="h-4 w-4" aria-hidden /> Novo banner
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum banner ainda — sem banner, o carrossel de promoções não aparece pro cliente.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-card p-5 shadow-card">
          {sorted.map((banner, index) => {
            const linkedCategory = categoryName(banner.category_id);
            return (
              <div key={banner.id} className="flex items-center gap-3 border-t border-border py-3 first:border-t-0">
                <div className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {banner.image_url ? (
                    <img src={banner.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{banner.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {linkedCategory ? `Leva pra "${linkedCategory}"` : "Só informativo"}
                  </p>
                </div>

                <button
                  onClick={() => onToggleActive(banner)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                    banner.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {banner.active ? "Ativo" : "Inativo"}
                </button>

                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => onMoveUp(banner)}
                    disabled={index === 0}
                    aria-label="Mover pra cima"
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    onClick={() => onMoveDown(banner)}
                    disabled={index === sorted.length - 1}
                    aria-label="Mover pra baixo"
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    onClick={() => onEdit(banner)}
                    aria-label={`Editar ${banner.title}`}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </button>
                  <button
                    onClick={() => onDelete(banner)}
                    aria-label={`Excluir ${banner.title}`}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
