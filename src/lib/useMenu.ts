import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Category, Product } from "./menu";
import type { Addon, AddonGroup } from "./addons";
import type { PromoBanner } from "./promoBanners";
import type { ComboComponent } from "./comboItems";
import type { ComboChoiceGroup } from "./comboChoiceGroups";
import type { RemovableIngredient } from "./removableIngredients";

export function useMenu(restaurantId: string | null) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [addonGroups, setAddonGroups] = useState<AddonGroup[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [comboItemsByProduct, setComboItemsByProduct] = useState<Map<string, ComboComponent[]>>(new Map());
  const [comboChoiceGroupsByProduct, setComboChoiceGroupsByProduct] = useState<Map<string, ComboChoiceGroup[]>>(
    new Map(),
  );
  const [removableIngredientsByProduct, setRemovableIngredientsByProduct] = useState<Map<string, RemovableIngredient[]>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase.from("categories").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
      supabase.from("products").select("*").eq("restaurant_id", restaurantId).eq("active", true).order("sort_order"),
      supabase.from("addon_groups").select("*").eq("restaurant_id", restaurantId).order("sort_order"),
      supabase
        .from("addons")
        .select("id, group_id, name, price, active, sort_order, addon_groups!inner(restaurant_id)")
        .eq("addon_groups.restaurant_id", restaurantId)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("promo_banners")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("combo_items")
        .select(
          "product_id, quantity, component:products!combo_items_component_product_id_fkey(name), combo:products!combo_items_product_id_fkey!inner(restaurant_id)",
        )
        .eq("combo.restaurant_id", restaurantId),
      supabase
        .from("combo_choice_groups")
        .select(
          "id, name, product_id, sort_order, combo:products!combo_choice_groups_product_id_fkey!inner(restaurant_id), combo_choice_options(option_product_id, sort_order, option:products!combo_choice_options_option_product_id_fkey(id, name))",
        )
        .eq("combo.restaurant_id", restaurantId)
        .order("sort_order"),
      supabase
        .from("public_removable_ingredients")
        .select("product_id, ingredient_id, name")
        .eq("restaurant_id", restaurantId),
    ]).then(
      ([
        { data: cats },
        { data: prods },
        { data: groups },
        { data: addonRows },
        { data: bannerRows },
        { data: comboRows },
        { data: choiceGroupRows },
        { data: ingredientRows },
      ]) => {
      setCategories((cats as Category[]) ?? []);
      setProducts((prods as Product[]) ?? []);
      setAddonGroups((groups as AddonGroup[]) ?? []);
      setAddons(
        (addonRows ?? []).map((row) => ({
          id: row.id,
          group_id: row.group_id,
          name: row.name,
          price: Number(row.price),
          active: row.active,
          sort_order: row.sort_order,
        })),
      );
      setBanners((bannerRows as PromoBanner[]) ?? []);

      const comboMap = new Map<string, ComboComponent[]>();
      for (const row of (comboRows ?? []) as unknown as {
        product_id: string;
        quantity: number;
        component: { name: string } | null;
      }[]) {
        if (!row.component) continue;
        const list = comboMap.get(row.product_id) ?? [];
        list.push({ name: row.component.name, quantity: row.quantity });
        comboMap.set(row.product_id, list);
      }
      setComboItemsByProduct(comboMap);

      const choiceGroupMap = new Map<string, ComboChoiceGroup[]>();
      for (const row of (choiceGroupRows ?? []) as unknown as {
        id: string;
        name: string;
        product_id: string;
        combo_choice_options: { sort_order: number; option: { id: string; name: string } | null }[];
      }[]) {
        const options = [...row.combo_choice_options]
          .sort((a, b) => a.sort_order - b.sort_order)
          .flatMap((opt) => (opt.option ? [{ productId: opt.option.id, name: opt.option.name }] : []));
        if (options.length === 0) continue;
        const list = choiceGroupMap.get(row.product_id) ?? [];
        list.push({ id: row.id, name: row.name, options });
        choiceGroupMap.set(row.product_id, list);
      }
      setComboChoiceGroupsByProduct(choiceGroupMap);

      const ingredientMap = new Map<string, RemovableIngredient[]>();
      for (const row of (ingredientRows ?? []) as unknown as {
        product_id: string;
        ingredient_id: string;
        name: string;
      }[]) {
        const list = ingredientMap.get(row.product_id) ?? [];
        list.push({ ingredientId: row.ingredient_id, name: row.name });
        ingredientMap.set(row.product_id, list);
      }
      setRemovableIngredientsByProduct(ingredientMap);

      setLoading(false);
    },
    );
  }, [restaurantId]);

  return {
    categories,
    products,
    addonGroups,
    addons,
    banners,
    comboItemsByProduct,
    comboChoiceGroupsByProduct,
    removableIngredientsByProduct,
    loading,
  };
}
