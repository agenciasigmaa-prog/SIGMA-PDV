import { supabase } from "./supabase";

export async function loadProductImages(productId: string): Promise<string[]> {
  const { data } = await supabase
    .from("product_images")
    .select("image_url")
    .eq("product_id", productId)
    .order("sort_order");
  return (data ?? []).map((row) => row.image_url);
}

// Mesmo padrão delete-all + insert-all de saveProductIngredients — edita a
// galeria inteira localmente, grava tudo de uma vez só ao salvar. A primeira
// foto vira products.image_url (a "capa" usada em todo o resto do app).
export async function saveProductImages(productId: string, urls: string[]): Promise<void> {
  await supabase.from("product_images").delete().eq("product_id", productId);
  if (urls.length > 0) {
    await supabase
      .from("product_images")
      .insert(urls.map((image_url, index) => ({ product_id: productId, image_url, sort_order: index })));
  }
  await supabase.from("products").update({ image_url: urls[0] ?? null }).eq("id", productId);
}
