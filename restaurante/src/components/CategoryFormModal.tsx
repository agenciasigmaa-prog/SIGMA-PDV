import { type FormEvent, useState } from "react";
import { X } from "lucide-react";
import { ImageUploadField } from "./ImageUploadField";
import type { Category } from "../lib/menu";

export function CategoryFormModal({
  restaurantId,
  category,
  onClose,
  onSave,
}: {
  restaurantId: string;
  category?: Category;
  onClose: () => void;
  onSave: (input: {
    name: string;
    image_url: string | null;
    allow_half_and_half: boolean;
    half_and_half_pricing: "higher_price" | "average";
  }) => Promise<string | void>;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(category?.image_url ?? null);
  const [imageUploading, setImageUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowHalfAndHalf, setAllowHalfAndHalf] = useState(category?.allow_half_and_half ?? false);
  const [pricingMode, setPricingMode] = useState<"higher_price" | "average">(
    category?.half_and_half_pricing ?? "higher_price",
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);

    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();

    try {
      await onSave({ name, image_url: imageUrl, allow_half_and_half: allowHalfAndHalf, half_and_half_pricing: pricingMode });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar categoria.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-elevated">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{category ? "Editar categoria" : "Nova categoria"}</h3>
          <button onClick={onClose} className="rounded-full p-1 hover:bg-muted" aria-label="Fechar">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            name="name"
            defaultValue={category?.name ?? ""}
            required
            placeholder="Nome da categoria"
            className="w-full rounded-xl border border-border px-3 py-2 text-sm"
          />

          <ImageUploadField
            label="Imagem da categoria"
            restaurantId={restaurantId}
            kind="categories"
            value={imageUrl}
            onChange={setImageUrl}
            onUploadingChange={setImageUploading}
          />

          <div className="rounded-xl border border-border p-3">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={allowHalfAndHalf}
                onChange={(e) => setAllowHalfAndHalf(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Permite montar meio a meio
                <span className="block text-xs text-muted-foreground">
                  Cliente pode pedir metade de um sabor e metade de outro produto desta categoria.
                </span>
              </span>
            </label>

            {allowHalfAndHalf && (
              <div className="mt-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Como cobrar quando os sabores têm preços diferentes</p>
                <div className="flex gap-1 rounded-full bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setPricingMode("higher_price")}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                      pricingMode === "higher_price" ? "bg-card shadow-card" : "text-muted-foreground"
                    }`}
                  >
                    Sabor mais caro
                  </button>
                  <button
                    type="button"
                    onClick={() => setPricingMode("average")}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                      pricingMode === "average" ? "bg-card shadow-card" : "text-muted-foreground"
                    }`}
                  >
                    Média dos dois
                  </button>
                </div>
              </div>
            )}
          </div>

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
