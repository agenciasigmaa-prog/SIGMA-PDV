import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type AddonGroup = { id: string; category_id: string; name: string; sort_order: number; required: boolean };
export type Addon = { id: string; group_id: string; name: string; price: number; sort_order: number };

// Adicionais por categoria — usado quando staff lança/adiciona item
// manualmente (ManualOrderModal, OrderDetailModal), pra oferecer a mesma
// seleção de adicionais que o cliente vê no cardápio. Combo/meio a
// meio/ingrediente removível ficam de fora dessa ação, mesma simplificação
// já assumida no resto do fluxo manual.
export function useAddonGroups(restaurantId: string | null) {
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase
        .from("addon_groups")
        .select("id, category_id, name, sort_order, required")
        .eq("restaurant_id", restaurantId)
        .order("sort_order"),
      supabase
        .from("addons")
        .select("id, group_id, name, price, sort_order, addon_groups!inner(restaurant_id)")
        .eq("addon_groups.restaurant_id", restaurantId)
        .eq("active", true)
        .order("sort_order"),
    ]).then(([{ data: groupRows }, { data: addonRows }]) => {
      setGroups((groupRows as AddonGroup[]) ?? []);
      setAddons(
        (addonRows ?? []).map((row) => ({
          id: row.id,
          group_id: row.group_id,
          name: row.name,
          price: Number(row.price),
          sort_order: row.sort_order,
        })),
      );
      setLoading(false);
    });
  }, [restaurantId]);

  function groupsForCategory(categoryId: string | null): { group: AddonGroup; addons: Addon[] }[] {
    if (!categoryId) return [];
    return groups
      .filter((g) => g.category_id === categoryId)
      .map((group) => ({ group, addons: addons.filter((a) => a.group_id === group.id) }))
      .filter((g) => g.addons.length > 0);
  }

  return { groupsForCategory, loading };
}
