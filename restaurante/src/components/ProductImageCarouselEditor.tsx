import { useState, type ChangeEvent } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Plus, X } from "lucide-react";
import { uploadMenuImage } from "../lib/uploadImage";

export function ProductImageCarouselEditor({
  restaurantId,
  images,
  onChange,
}: {
  restaurantId: string;
  images: string[];
  onChange: (images: string[]) => void;
}) {
  const [active, setActive] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slideCount = images.length + 1; // +1 pelo tile de "adicionar foto"

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await uploadMenuImage(file, restaurantId, "products");
      const next = [...images, url];
      onChange(next);
      setActive(next.length - 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar imagem.");
    } finally {
      setUploading(false);
    }
  }

  function handleRemove(index: number) {
    const next = images.filter((_, i) => i !== index);
    onChange(next);
    setActive((prev) => Math.min(prev, next.length));
  }

  function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setActive(target);
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        <div
          className="flex transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: `translateX(-${active * 100}%)` }}
        >
          {images.map((url, index) => (
            <div key={url} className="relative h-48 w-full shrink-0 md:h-64">
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                aria-label="Remover foto"
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => handleMove(index, -1)}
                  aria-label="Mover foto pra trás"
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
              )}
              {index < images.length - 1 && (
                <button
                  type="button"
                  onClick={() => handleMove(index, 1)}
                  aria-label="Mover foto pra frente"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          ))}

          <label className="flex h-48 w-full shrink-0 cursor-pointer flex-col items-center justify-center gap-2 text-muted-foreground md:h-64">
            {uploading ? (
              <span className="text-sm">Enviando...</span>
            ) : (
              <>
                {images.length === 0 ? <ImageIcon className="h-8 w-8" aria-hidden /> : <Plus className="h-8 w-8" aria-hidden />}
                <span className="text-sm font-medium">Adicionar foto</span>
              </>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>

        {slideCount > 1 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {Array.from({ length: slideCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Ir pra foto ${index + 1}`}
                onClick={() => setActive(index)}
                className={`pointer-events-auto h-1.5 rounded-full transition-all ${
                  index === active ? "w-5 bg-white" : "w-1.5 bg-white/60"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  );
}
