import { type FormEvent, useState } from "react";
import { X } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import type { PromoBanner } from "../lib/promoBanners";
import type { Category } from "../lib/menu";

export function PromoBannerFormModal({
  restaurantId,
  categories,
  banner,
  onClose,
  onSave,
}: {
  restaurantId: string;
  categories: Category[];
  banner?: PromoBanner;
  onClose: () => void;
  onSave: (input: {
    title: string;
    subtitle: string | null;
    cta_label: string;
    image_url: string;
    category_id: string | null;
    active: boolean;
  }) => Promise<void>;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(banner?.image_url ?? null);
  const [imageUploading, setImageUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const subtitle = String(form.get("subtitle") ?? "").trim();
    const ctaLabel = String(form.get("cta_label") ?? "").trim();
    const categoryId = String(form.get("category_id") ?? "");

    if (!title || !imageUrl) {
      setError("Título e imagem são obrigatórios.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        title,
        subtitle: subtitle || null,
        cta_label: ctaLabel || "Ver mais",
        image_url: imageUrl,
        category_id: categoryId || null,
        active: form.get("active") === "on",
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar banner.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-6 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{banner ? "Editar banner" : "Novo banner"}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <ImageUploadField
            label="Imagem do banner"
            restaurantId={restaurantId}
            kind="banners"
            value={imageUrl}
            onChange={setImageUrl}
            onUploadingChange={setImageUploading}
          />

          <div>
            <label className="mb-1 block text-sm font-medium">Título</label>
            <input
              name="title"
              defaultValue={banner?.title ?? ""}
              required
              placeholder="Ex: Combos em promoção"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Subtítulo (opcional)</label>
            <input
              name="subtitle"
              defaultValue={banner?.subtitle ?? ""}
              placeholder="Ex: Até 20% off nos combos da casa"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Texto do botão</label>
            <input
              name="cta_label"
              defaultValue={banner?.cta_label ?? "Ver mais"}
              placeholder="Ex: Ver combos"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Leva pra categoria (opcional)</label>
            <select
              name="category_id"
              defaultValue={banner?.category_id ?? ""}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm"
            >
              <option value="">Nenhuma — só informativo</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={banner?.active ?? true} />
            Ativo
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={saving || imageUploading}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {imageUploading ? "Enviando imagem..." : saving ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </div>
    </div>
  );
}
