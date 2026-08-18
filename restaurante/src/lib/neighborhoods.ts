import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "./supabase";

export type Neighborhood = { id: string; name: string; delivery_fee: number; active: boolean };

// Bairros de entrega e a taxa cobrada em cada um — CRUD direto (RLS já
// cobre), mesmo padrão de `waiters`/`delivery_drivers`. A taxa é cobrada do
// cliente (soma no total do pedido) e é exatamente o que o motoboy recebe
// por aquela entrega.
export function useNeighborhoods(restaurantId: string | null) {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("neighborhoods")
      .select("id, name, delivery_fee, active")
      .eq("restaurant_id", restaurantId)
      .order("name");
    setNeighborhoods((data ?? []).map((n) => ({ ...n, delivery_fee: Number(n.delivery_fee) })));
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`neighborhoods-${restaurantId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "neighborhoods", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, load, instanceId]);

  async function createNeighborhood(name: string, deliveryFee: number): Promise<{ ok: boolean; error?: string }> {
    if (!restaurantId) return { ok: false, error: "Restaurante não identificado" };
    const { error } = await supabase
      .from("neighborhoods")
      .insert({ restaurant_id: restaurantId, name, delivery_fee: deliveryFee });
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }

  async function updateNeighborhoodFee(neighborhoodId: string, deliveryFee: number): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.from("neighborhoods").update({ delivery_fee: deliveryFee }).eq("id", neighborhoodId);
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }

  async function setNeighborhoodActive(neighborhoodId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.from("neighborhoods").update({ active }).eq("id", neighborhoodId);
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }

  return { neighborhoods, loading, createNeighborhood, updateNeighborhoodFee, setNeighborhoodActive };
}
