import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Order } from "./orders";

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("orders")
      .select("id, restaurant_id, order_type, status, payment_method, payment_status, subtotal, total, created_at, restaurants(name)")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setOrders((data as unknown as Order[]) ?? []);
        setLoading(false);
      });
  }, []);

  return { orders, loading };
}
