import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "./supabase";
import type { OrderType } from "./OrderChannelContext";

export type MyOrderStatus = "received" | "preparing" | "ready" | "completed" | "cancelled";

export type MyOrderItem = { id: string; name: string; quantity: number };

export type MyOrder = {
  id: string;
  status: MyOrderStatus;
  orderType: OrderType;
  createdAt: string;
  total: number;
  tableLabel: string | null;
  pickupCode: string | null;
  deliveryAddressText: string | null;
  neighborhoodName: string | null;
  items: MyOrderItem[];
};

// products!order_items_product_id_fkey desambigua o embed: order_items tem
// DUAS FKs pra products (product_id e half_flavor_product_id), mesmo padrão
// já usado em restaurante/src/lib/orders.ts. Não inclui delivery_drivers —
// a RLS dessa tabela (delivery_drivers_all) só libera leitura pra
// staff/admin, então um embed aqui sempre voltaria null pro cliente.
const SELECT =
  "id, status, order_type, created_at, total, table_label, pickup_code, delivery_address, neighborhood_name, order_items(id, quantity, products!order_items_product_id_fkey(name))";

type OrderRow = {
  id: string;
  status: MyOrderStatus;
  order_type: OrderType;
  created_at: string;
  total: number;
  table_label: string | null;
  pickup_code: string | null;
  delivery_address: { text?: string } | null;
  neighborhood_name: string | null;
  order_items: { id: string; quantity: number; products: { name: string } | null }[];
};

function toMyOrder(row: OrderRow): MyOrder {
  return {
    id: row.id,
    status: row.status,
    orderType: row.order_type,
    createdAt: row.created_at,
    total: Number(row.total),
    tableLabel: row.table_label,
    pickupCode: row.pickup_code,
    deliveryAddressText: row.delivery_address?.text ?? null,
    neighborhoodName: row.neighborhood_name,
    items: row.order_items.map((item) => ({ id: item.id, name: item.products?.name ?? "Item", quantity: item.quantity })),
  };
}

// Pedido mais recente do cliente logado NESTE restaurante — "meu pedido" no
// storefront é sempre relativo à loja aberta, não uma lista cruzando todos
// os restaurantes que ele já usou (cada /loja/:restaurantId é uma sessão de
// pedido separada). RLS (orders_select: customer_id = auth.uid()) já cobre
// a leitura direta, sem precisar de Edge Function.
export function useMyOrder(restaurantId: string | null, customerId: string | null) {
  const [order, setOrder] = useState<MyOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();

  const load = useCallback(async () => {
    if (!restaurantId || !customerId) {
      setOrder(null);
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
      .limit(1)
      .maybeSingle();
    setOrder(data ? toMyOrder(data as unknown as OrderRow) : null);
    setLoading(false);
  }, [restaurantId, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  // Filtro do realtime só por customer_id (postgres_changes não combina
  // duas colunas numa AND) — o reload em si já refiltra por restaurant_id,
  // o filtro aqui só serve pra disparar esse reload na hora certa.
  useEffect(() => {
    if (!restaurantId || !customerId) return;
    const channel = supabase
      .channel(`my-order-${restaurantId}-${customerId}-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${customerId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, customerId, load, instanceId]);

  return { order, loading };
}
