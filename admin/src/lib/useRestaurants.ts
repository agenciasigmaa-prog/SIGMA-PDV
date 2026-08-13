import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Restaurant, RestaurantStatus } from "./restaurant";

export function useRestaurants() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("restaurants").select("*").order("created_at", { ascending: false });
    setRestaurants((data as Restaurant[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(restaurantId: string, status: RestaurantStatus) {
    await supabase.functions.invoke("admin-set-account-status", { body: { restaurant_id: restaurantId, status } });
    load();
  }

  return { restaurants, loading, reload: load, setStatus };
}
