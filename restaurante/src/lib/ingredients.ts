import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Unit = "g" | "ml" | "un";

export type Ingredient = {
  id: string;
  restaurant_id: string;
  name: string;
  unit: Unit;
  package_quantity: number;
  package_price: number;
  cost_per_unit: number;
};

// Uma linha no editor do produto: aponta pra um ingrediente já cadastrado,
// ou carrega os dados pra criar um novo ingrediente na hora de salvar.
// `removable` controla se o cliente da loja pode tirar esse ingrediente do
// pedido — default true (comportamento de sempre), mas dá pra travar itens
// que não fazem sentido sem (ex. o pão de um hambúrguer).
export type ProductIngredientLine =
  | {
      kind: "existing";
      ingredient_id: string;
      name: string;
      unit: Unit;
      cost_per_unit: number;
      quantity_used: number;
      removable: boolean;
    }
  | {
      kind: "new";
      name: string;
      unit: Unit;
      package_quantity: number;
      package_price: number;
      quantity_used: number;
      removable: boolean;
    };

export function lineCostPerUnit(line: ProductIngredientLine): number {
  return line.kind === "existing" ? line.cost_per_unit : line.package_price / line.package_quantity;
}

export function lineCost(line: ProductIngredientLine): number {
  return lineCostPerUnit(line) * line.quantity_used;
}

export function totalCmv(lines: ProductIngredientLine[]): number {
  return lines.reduce((sum, line) => sum + lineCost(line), 0);
}

export function useIngredients(restaurantId: string | null) {
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("ingredients")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("name");
    setIngredients((data as Ingredient[]) ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  return { ingredients, loading, reload: load };
}

// Grava a receita completa do produto: cria os ingredientes novos primeiro,
// depois substitui todas as linhas de product_ingredients — mesmo padrão do
// resto do formulário (edita tudo, salva tudo de uma vez, sem diff por linha).
export async function saveProductIngredients(
  restaurantId: string,
  productId: string,
  lines: ProductIngredientLine[],
): Promise<void> {
  const resolvedLines: { ingredient_id: string; quantity_used: number; removable: boolean }[] = [];

  for (const line of lines) {
    if (line.kind === "existing") {
      resolvedLines.push({ ingredient_id: line.ingredient_id, quantity_used: line.quantity_used, removable: line.removable });
      continue;
    }
    const { data, error } = await supabase
      .from("ingredients")
      .insert({
        restaurant_id: restaurantId,
        name: line.name,
        unit: line.unit,
        package_quantity: line.package_quantity,
        package_price: line.package_price,
      })
      .select("id")
      .single();
    if (error) throw error;
    resolvedLines.push({ ingredient_id: data.id, quantity_used: line.quantity_used, removable: line.removable });
  }

  await supabase.from("product_ingredients").delete().eq("product_id", productId);
  if (resolvedLines.length > 0) {
    await supabase
      .from("product_ingredients")
      .insert(resolvedLines.map((line) => ({ ...line, product_id: productId })));
  }
}

// Carrega as linhas já salvas de um produto, no formato que o editor usa.
export async function loadProductIngredientLines(productId: string): Promise<ProductIngredientLine[]> {
  const { data } = await supabase
    .from("product_ingredients")
    .select("quantity_used, removable, ingredients(id, name, unit, cost_per_unit)")
    .eq("product_id", productId);

  return (
    (data ?? []) as unknown as {
      quantity_used: number;
      removable: boolean;
      ingredients: { id: string; name: string; unit: Unit; cost_per_unit: number };
    }[]
  ).map(
    (row) => ({
      kind: "existing",
      ingredient_id: row.ingredients.id,
      name: row.ingredients.name,
      unit: row.ingredients.unit,
      cost_per_unit: Number(row.ingredients.cost_per_unit),
      quantity_used: Number(row.quantity_used),
      removable: row.removable,
    }),
  );
}
