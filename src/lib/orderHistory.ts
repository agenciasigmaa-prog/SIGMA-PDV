import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "./supabase";
import { SELECT, toMyOrder, type MyOrder, type OrderRow } from "./myOrder";

const HISTORY_LIMIT = 20;

// Histórico de pedidos do cliente logado NESTE restaurante — ao contrário de
// useMyOrder (só o pedido rastreável mais recente, com janela de 3h pra
// pedido encerrado), aqui não tem filtro nenhum: mostra os últimos pedidos
// de verdade, incluindo os que useMyOrder já escondeu do rastreio "pedido
// atual". Mesmo escopo por restaurante que useMyOrder (não cruza lojas).
export function useOrderHistory(restaurantId: string | null, customerId: string | null) {
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();

  const load = useCallback(async () => {
    if (!restaurantId || !customerId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select(SELECT)
      .eq("restaurant_id", restaurantId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    setOrders(((data ?? []) as unknown as OrderRow[]).map(toMyOrder));
    setLoading(false);
  }, [restaurantId, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  // Mesmo raciocínio de useMyOrder: realtime só filtra por customer_id
  // (Postgres não combina duas colunas numa AND), o reload em si refiltra
  // por restaurant_id.
  useEffect(() => {
    if (!restaurantId || !customerId) return;
    const channel = supabase
      .channel(`order-history-${restaurantId}-${customerId}-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${customerId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, customerId, load, instanceId]);

  return { orders, loading };
}
