import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Category, Product } from "./menu";

export function useMenu(restaurantId: string | null) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from("categories").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
      supabase.from("products").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
    ]);
    setCategories((cats as Category[]) ?? []);
    setProducts((prods as Product[]) ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createCategory(input: {
    name: string;
    image_url: string | null;
    allow_half_and_half?: boolean;
    half_and_half_pricing?: "higher_price" | "average";
  }): Promise<string> {
    const nextOrder = categories.length ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 0;
    const { data, error } = await supabase
      .from("categories")
      .insert({ ...input, restaurant_id: restaurantId, sort_order: nextOrder })
      .select("id")
      .single();
    if (error) throw error;
    await load();
    return data.id;
  }

  async function updateCategory(
    id: string,
    patch: Partial<Pick<Category, "name" | "image_url" | "allow_half_and_half" | "half_and_half_pricing">>,
  ) {
    await supabase.from("categories").update(patch).eq("id", id);
    await load();
  }

  async function deleteCategory(id: string) {
    // FK products.category_id -> on delete set null cuida dos produtos afetados.
    await supabase.from("categories").delete().eq("id", id);
    await load();
  }

  // Reindexação sequencial 0..n-1 da lista inteira na nova ordem — usado
  // pelo drag-and-drop, que já entrega a lista completa reordenada.
  async function reorderCategories(orderedIds: string[]) {
    await Promise.all(orderedIds.map((id, index) => supabase.from("categories").update({ sort_order: index }).eq("id", id)));
    await load();
  }

  async function createProduct(input: Omit<Product, "id" | "restaurant_id" | "sort_order">): Promise<string> {
    const siblings = products.filter((p) => p.category_id === input.category_id);
    const nextOrder = siblings.length ? Math.max(...siblings.map((p) => p.sort_order)) + 1 : 0;
    const { data, error } = await supabase
      .from("products")
      .insert({ ...input, restaurant_id: restaurantId, sort_order: nextOrder })
      .select("id")
      .single();
    if (error) throw error;
    await load();
    return data.id;
  }

  async function updateProduct(id: string, patch: Partial<Omit<Product, "id" | "restaurant_id">>) {
    await supabase.from("products").update(patch).eq("id", id);
    await load();
  }

  async function duplicateProduct(product: Product, targetCategoryId?: string | null): Promise<string> {
    return createProduct({
      category_id: targetCategoryId !== undefined ? targetCategoryId : product.category_id,
      name: `${product.name} (cópia)`,
      description: product.description,
      image_url: product.image_url,
      price: product.price,
      original_price: product.original_price,
      prep_minutes: product.prep_minutes,
      most_ordered: product.most_ordered,
      active: product.active,
      sold_out: false,
    });
  }

  async function deleteProduct(id: string) {
    await supabase.from("products").delete().eq("id", id);
    await load();
  }

  async function reorderProducts(orderedIds: string[]) {
    await Promise.all(orderedIds.map((id, index) => supabase.from("products").update({ sort_order: index }).eq("id", id)));
    await load();
  }

  return {
    categories,
    products,
    loading,
    reload: load,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    createProduct,
    updateProduct,
    duplicateProduct,
    deleteProduct,
    reorderProducts,
  };
}
