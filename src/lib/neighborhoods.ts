import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Neighborhood = { id: string; name: string; delivery_fee: number };

// Só bairro ativo, leitura pública (RLS: neighborhoods_select_public) — o
// cliente escolhe pra saber a taxa de entrega antes de confirmar o pedido.
export function useNeighborhoods(restaurantId: string | null) {
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("neighborhoods")
      .select("id, name, delivery_fee")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setNeighborhoods((data ?? []).map((n) => ({ ...n, delivery_fee: Number(n.delivery_fee) })));
        setLoading(false);
      });
  }, [restaurantId]);

  return { neighborhoods, loading };
}
