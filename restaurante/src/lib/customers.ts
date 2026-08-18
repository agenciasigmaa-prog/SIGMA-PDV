import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type CustomerOrderItem = { product_name: string; category_name: string | null; quantity: number };
export type CustomerOrder = {
  id: string;
  total: number;
  order_type: string;
  status: string;
  created_at: string;
  items: CustomerOrderItem[];
};
export type Customer = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  orders: CustomerOrder[];
};

type RawOrderItem = {
  quantity: number;
  products: { name: string; categories: { name: string } | null } | null;
};
type RawOrder = {
  id: string;
  customer_id: string | null;
  total: number;
  order_type: string;
  status: string;
  created_at: string;
  order_items: RawOrderItem[];
};
type RawProfile = { id: string; full_name: string | null; email: string | null; phone: string | null; address: string | null };

// Clientes que já pediram NESTE restaurante. O cadastro (profiles) em si é
// universal na plataforma — o mesmo cliente pode ter pedido de outros
// restaurantes também — mas aqui só agregamos e mostramos o histórico dele
// COM ESTE restaurante: a query de orders já é filtrada por restaurant_id, e
// a RLS de profiles (profiles_select_restaurant_customers) só libera ler o
// perfil de quem tem pelo menos um pedido aqui, então não há como um
// restaurante "descobrir" cliente que nunca pediu com ele.
export function useCustomers(restaurantId: string | null) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      // order_items tem duas FKs pra products (product_id e
      // half_flavor_product_id) — precisa nomear a constraint, senão o
      // PostgREST não sabe qual delas embutir (mesmo caso de orders.ts).
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(
          "id, customer_id, total, order_type, status, created_at, order_items(quantity, products!order_items_product_id_fkey(name, categories(name)))",
        )
        .eq("restaurant_id", restaurantId)
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (ordersError) {
        setLoading(false);
        return;
      }

      const rawOrders = (orders ?? []) as unknown as RawOrder[];
      const customerIds = [...new Set(rawOrders.map((o) => o.customer_id).filter((id): id is string => !!id))];
      if (customerIds.length === 0) {
        setCustomers([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, phone, address")
        .in("id", customerIds);
      if (cancelled) return;

      const byCustomer = new Map<string, Customer>();
      for (const p of (profiles ?? []) as RawProfile[]) {
        byCustomer.set(p.id, { id: p.id, full_name: p.full_name, email: p.email, phone: p.phone, address: p.address, orders: [] });
      }
      for (const o of rawOrders) {
        const customer = o.customer_id ? byCustomer.get(o.customer_id) : undefined;
        if (!customer) continue;
        customer.orders.push({
          id: o.id,
          total: Number(o.total),
          order_type: o.order_type,
          status: o.status,
          created_at: o.created_at,
          items: (o.order_items ?? []).map((item) => ({
            product_name: item.products?.name ?? "Produto removido",
            category_name: item.products?.categories?.name ?? null,
            quantity: item.quantity,
          })),
        });
      }

      setCustomers([...byCustomer.values()].sort((a, b) => b.orders.length - a.orders.length));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return { customers, loading };
}

export type CustomerMetrics = {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  avgIntervalDays: number | null;
  topProducts: { name: string; count: number }[];
};

// "Interesses" = produtos mais pedidos por esse cliente (derivado do
// histórico, não é um campo cadastrado). "Frequência" = intervalo médio em
// dias entre um pedido e o próximo, só faz sentido com 2+ pedidos.
export function customerMetrics(customer: Customer): CustomerMetrics {
  const orderCount = customer.orders.length;
  const totalSpent = customer.orders.reduce((sum, o) => sum + o.total, 0);
  const lastOrderAt = customer.orders[0]?.created_at ?? null;

  let avgIntervalDays: number | null = null;
  if (orderCount > 1) {
    const timestamps = customer.orders.map((o) => new Date(o.created_at).getTime()).sort((a, b) => a - b);
    const span = timestamps[timestamps.length - 1] - timestamps[0];
    avgIntervalDays = span / (orderCount - 1) / 86_400_000;
  }

  const productCounts = new Map<string, number>();
  for (const order of customer.orders) {
    for (const item of order.items) {
      productCounts.set(item.product_name, (productCounts.get(item.product_name) ?? 0) + item.quantity);
    }
  }
  const topProducts = [...productCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  return { orderCount, totalSpent, lastOrderAt, avgIntervalDays, topProducts };
}
