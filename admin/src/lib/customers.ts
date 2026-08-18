import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type CustomerOrder = {
  id: string;
  total: number;
  order_type: string;
  status: string;
  created_at: string;
  restaurant_id: string;
  restaurant_name: string;
};
export type Customer = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  orders: CustomerOrder[];
};

type RawOrder = {
  id: string;
  customer_id: string | null;
  total: number;
  order_type: string;
  status: string;
  created_at: string;
  restaurant_id: string;
  restaurants: { name: string } | null;
};
type RawProfile = { id: string; full_name: string | null; email: string | null; phone: string | null; address: string | null };

// Cadastro de cliente (profiles) é único e universal na plataforma — o admin
// enxerga TODOS os clientes de TODOS os restaurantes (RLS: current_app_role()
// = 'admin' já libera tudo em orders/profiles), diferente da versão de
// restaurante/ (que só vê quem pediu com ELE). Mesmo cliente pode aparecer
// pedindo de restaurantes diferentes — por isso cada pedido carrega o nome
// do restaurante, pra distinguir na lista.
export function useCustomers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, customer_id, total, order_type, status, created_at, restaurant_id, restaurants(name)")
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(2000);

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
          restaurant_id: o.restaurant_id,
          restaurant_name: o.restaurants?.name ?? "Restaurante removido",
        });
      }

      setCustomers([...byCustomer.values()].sort((a, b) => b.orders.length - a.orders.length));
      setLoading(false);
    })();
  }, []);

  return { customers, loading };
}

export type CustomerMetrics = {
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  restaurantNames: string[];
};

export function customerMetrics(customer: Customer): CustomerMetrics {
  return {
    orderCount: customer.orders.length,
    totalSpent: customer.orders.reduce((sum, o) => sum + o.total, 0),
    lastOrderAt: customer.orders[0]?.created_at ?? null,
    restaurantNames: [...new Set(customer.orders.map((o) => o.restaurant_name))],
  };
}
