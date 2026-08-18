import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type RemovableIngredient = { ingredientId: string; name: string };

// Ingredientes removíveis por produto — mesma view pública que o cardápio do
// cliente usa (`public_removable_ingredients`, nome liberado mas custo
// continua privado), agora também pro staff poder tirar ingrediente ao
// lançar/adicionar item manualmente.
export function useRemovableIngredients(restaurantId: string | null) {
  const [byProduct, setByProduct] = useState<Map<string, RemovableIngredient[]>>(new Map());

  useEffect(() => {
    if (!restaurantId) return;
    supabase
      .from("public_removable_ingredients")
      .select("product_id, ingredient_id, name")
      .eq("restaurant_id", restaurantId)
      .then(({ data }) => {
        const map = new Map<string, RemovableIngredient[]>();
        for (const row of data ?? []) {
          const list = map.get(row.product_id) ?? [];
          list.push({ ingredientId: row.ingredient_id, name: row.name });
          map.set(row.product_id, list);
        }
        setByProduct(map);
      });
  }, [restaurantId]);

  function forProduct(productId: string): RemovableIngredient[] {
    return byProduct.get(productId) ?? [];
  }

  return { forProduct };
}
