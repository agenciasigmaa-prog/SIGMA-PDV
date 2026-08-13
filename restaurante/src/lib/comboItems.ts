import { supabase } from "./supabase";

export type ComboItemLine = {
  component_product_id: string;
  name: string;
  quantity: number;
};

export async function loadComboItems(productId: string): Promise<ComboItemLine[]> {
  const { data } = await supabase
    .from("combo_items")
    .select("quantity, products!combo_items_component_product_id_fkey(id, name)")
    .eq("product_id", productId);

  return ((data ?? []) as unknown as { quantity: number; products: { id: string; name: string } }[]).map((row) => ({
    component_product_id: row.products.id,
    name: row.products.name,
    quantity: row.quantity,
  }));
}

// Mesmo padrão delete-all + insert-all de saveProductIngredients/saveProductImages.
export async function saveComboItems(productId: string, items: ComboItemLine[]): Promise<void> {
  await supabase.from("combo_items").delete().eq("product_id", productId);
  if (items.length > 0) {
    await supabase.from("combo_items").insert(
      items.map((item) => ({
        product_id: productId,
        component_product_id: item.component_product_id,
        quantity: item.quantity,
      })),
    );
  }
}
