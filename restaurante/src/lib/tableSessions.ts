import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type SessionOrderAddon = {
  name: string;
  quantity: number;
  unit_price: number;
};

export type SessionOrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  addons: SessionOrderAddon[];
};

export type SessionOrder = {
  id: string;
  status: string;
  payment_status: string;
  total: number;
  items: SessionOrderItem[];
};

export type OpenTableSession = {
  id: string;
  table_id: string;
  table_label: string;
  opened_at: string;
  orders: SessionOrder[];
};

export function sessionTotal(session: OpenTableSession): number {
  return session.orders.reduce((sum, order) => sum + order.total, 0);
}

export function useOpenTableSessions(restaurantId: string | null) {
  const [sessions, setSessions] = useState<OpenTableSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: rawSessions } = await supabase
      .from("table_sessions")
      .select("id, table_id, opened_at, status, tables!inner(label, restaurant_id)")
      .eq("status", "open")
      .eq("tables.restaurant_id", restaurantId)
      .order("opened_at");

    const sessionIds = (rawSessions ?? []).map((s) => s.id);
    const { data: rawOrders } = sessionIds.length
      ? await supabase
          .from("orders")
          .select(
            "id, status, payment_status, total, table_session_id, order_items(id, quantity, unit_price, products(name), order_item_addons(name, quantity, unit_price))",
          )
          .in("table_session_id", sessionIds)
      : { data: [] };

    type RawItem = {
      id: string;
      quantity: number;
      unit_price: number;
      products: { name: string } | null;
      order_item_addons: { name: string; quantity: number; unit_price: number }[];
    };

    const ordersBySession = new Map<string, SessionOrder[]>();
    for (const order of rawOrders ?? []) {
      const list = ordersBySession.get(order.table_session_id as string) ?? [];
      list.push({
        id: order.id,
        status: order.status,
        payment_status: order.payment_status,
        total: Number(order.total),
        items: (order.order_items as unknown as RawItem[]).map((item) => ({
          id: item.id,
          product_name: item.products?.name ?? "Produto removido",
          quantity: item.quantity,
          unit_price: Number(item.unit_price),
          addons: (item.order_item_addons ?? []).map((addon) => ({
            name: addon.name,
            quantity: addon.quantity,
            unit_price: Number(addon.unit_price),
          })),
        })),
      });
      ordersBySession.set(order.table_session_id as string, list);
    }

    setSessions(
      (rawSessions ?? []).map((s) => ({
        id: s.id,
        table_id: s.table_id,
        table_label: (s.tables as unknown as { label: string }).label,
        opened_at: s.opened_at,
        orders: ordersBySession.get(s.id) ?? [],
      })),
    );
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function closeSession(session: OpenTableSession) {
    const orderIds = session.orders.map((o) => o.id);
    if (orderIds.length > 0) {
      await supabase.from("orders").update({ status: "completed", payment_status: "paid" }).in("id", orderIds);
    }
    await supabase
      .from("table_sessions")
      .update({ status: "closed", closed_at: new Date().toISOString(), total_charged: sessionTotal(session) })
      .eq("id", session.id);
    await load();
  }

  return { sessions, loading, reload: load, closeSession };
}
