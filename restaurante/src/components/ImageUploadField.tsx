import { useRef, useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { deleteMenuImage, uploadMenuImage } from "../lib/uploadImage";

export function ImageUploadField({
  label,
  restaurantId,
  kind,
  value,
  onChange,
  onUploadingChange,
}: {
  label: string;
  restaurantId: string;
  kind: "categories" | "products" | "branding" | "banners";
  value: string | null;
  onChange: (url: string | null) => void;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setUploading(true);
    onUploadingChange(true);
    try {
      const newUrl = await uploadMenuImage(file, restaurantId, kind);
      // Só apaga a imagem antiga depois que a nova subiu com sucesso — nunca
      // o contrário, pra não ficar sem imagem se o novo upload falhar.
      if (value) await deleteMenuImage(value);
      onChange(newUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar imagem.");
    } finally {
      setUploading(false);
      onUploadingChange(false);
    }
  }

  async function handleRemove() {
    if (!value) return;
    await deleteMenuImage(value);
    onChange(null);
  }

  return (
    <div>
      <p className="mb-1 block text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-60"
          >
            {uploading ? "Enviando..." : value ? "Trocar imagem" : "Adicionar imagem"}
          </button>
          {value && !uploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" aria-hidden /> Remover
            </button>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
