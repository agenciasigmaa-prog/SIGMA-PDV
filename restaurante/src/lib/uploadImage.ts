import { supabase } from "./supabase";

const BUCKET = "menu-images";

export async function uploadMenuImage(
  file: File,
  restaurantId: string,
  kind: "categories" | "products" | "branding" | "banners",
): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${restaurantId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Best-effort: apagar imagem antiga é sempre limpeza secundária, nunca deve
// quebrar o fluxo principal de salvar/trocar imagem.
export async function deleteMenuImage(publicUrl: string): Promise<void> {
  const marker = `/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return;
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}
