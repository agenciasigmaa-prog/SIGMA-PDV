import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type AddonGroup = {
  id: string;
  restaurant_id: string;
  category_id: string;
  name: string;
  sort_order: number;
  required: boolean;
};

export type Addon = {
  id: string;
  group_id: string;
  name: string;
  price: number;
  active: boolean;
  sort_order: number;
};

export function useAddonGroups(restaurantId: string | null) {
  const [groups, setGroups] = useState<AddonGroup[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: groupRows } = await supabase
      .from("addon_groups")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order");
    const groupIds = (groupRows ?? []).map((g) => g.id);
    const { data: addonRows } = groupIds.length
      ? await supabase.from("addons").select("*").in("group_id", groupIds).order("sort_order")
      : { data: [] };
    setGroups((groupRows as AddonGroup[]) ?? []);
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
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createGroup(categoryId: string, name: string, required = false): Promise<string> {
    if (!restaurantId) throw new Error("Sem restaurantId");
    const siblings = groups.filter((g) => g.category_id === categoryId);
    const nextOrder = siblings.length ? Math.max(...siblings.map((g) => g.sort_order)) + 1 : 0;
    const { data, error } = await supabase
      .from("addon_groups")
      .insert({ restaurant_id: restaurantId, category_id: categoryId, name, required, sort_order: nextOrder })
      .select("id")
      .single();
    if (error) throw error;
    await load();
    return data.id;
  }

  async function updateGroup(id: string, patch: Partial<Pick<AddonGroup, "name" | "required">>) {
    await supabase.from("addon_groups").update(patch).eq("id", id);
    await load();
  }

  async function deleteGroup(id: string) {
    // addons.group_id é on delete cascade — apaga o grupo já leva os adicionais dele junto.
    await supabase.from("addon_groups").delete().eq("id", id);
    await load();
  }

  async function createAddon(groupId: string, input: { name: string; price: number; active?: boolean }) {
    const siblings = addons.filter((a) => a.group_id === groupId);
    const nextOrder = siblings.length ? Math.max(...siblings.map((a) => a.sort_order)) + 1 : 0;
    await supabase.from("addons").insert({ group_id: groupId, ...input, sort_order: nextOrder });
    await load();
  }

  async function updateAddon(id: string, input: Partial<Pick<Addon, "name" | "price" | "active">>) {
    await supabase.from("addons").update(input).eq("id", id);
    await load();
  }

  async function deleteAddon(id: string) {
    await supabase.from("addons").delete().eq("id", id);
    await load();
  }

  return {
    groups,
    addons,
    loading,
    reload: load,
    createGroup,
    updateGroup,
    deleteGroup,
    createAddon,
    updateAddon,
    deleteAddon,
  };
}
