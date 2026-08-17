import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type OrderStatus = "received" | "preparing" | "ready" | "completed" | "cancelled";
export type OrderType = "dine_in" | "pickup" | "delivery";

// Ordem do pipeline — "cancelled" fica fora, é um desvio, não um próximo passo.
export const STATUS_ORDER: OrderStatus[] = ["received", "preparing", "ready", "completed"];

export function nextStatus(status: OrderStatus): OrderStatus | null {
  const index = STATUS_ORDER.indexOf(status);
  if (index === -1 || index === STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[index + 1];
}

export type IncomingOrderAddon = { name: string; quantity: number; unit_price: number };
export type IncomingOrderComboChoice = { group_name: string; option_name: string };

export type IncomingOrderItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  half_flavor_name: string | null;
  notes: string | null;
  addons: IncomingOrderAddon[];
  combo_choices: IncomingOrderComboChoice[];
  removed_ingredients: string[];
};

export type PaymentMethod = "cash" | "card" | "pix";

export type IncomingOrder = {
  id: string;
  customer_name: string;
  table_label: string;
  pickup_code: string | null;
  delivery_address: { text: string } | null;
  status: OrderStatus;
  order_type: OrderType;
  payment_status: string;
  payment_method: PaymentMethod | null;
  notes: string | null;
  subtotal: number;
  discount_amount: number;
  service_charge_amount: number;
  total: number;
  created_at: string;
  status_changed_at: string;
  items: IncomingOrderItem[];
};

export function itemTotal(item: IncomingOrderItem): number {
  const addonsPerUnit = item.addons.reduce((sum, addon) => sum + addon.unit_price * addon.quantity, 0);
  return (item.unit_price + addonsPerUnit) * item.quantity;
}

// "Onde entregar" — mesa, código de retirada ou entrega — usado em todo
// lugar que mostra um pedido (card, detalhe, comanda) pra não duplicar essa
// lógica e evitar o card mostrar "Mesa null" num pedido de entrega/retirada.
export function orderLocationLabel(order: Pick<IncomingOrder, "order_type" | "table_label" | "pickup_code">): string {
  if (order.order_type === "pickup") return `Retirada #${order.pickup_code ?? "?"}`;
  if (order.order_type === "delivery") return "Entrega";
  return `Mesa ${order.table_label}`;
}

function startOfToday(): string {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

// order_items tem duas FKs pra products (product_id e half_flavor_product_id)
// — precisa nomear a constraint pra o PostgREST saber qual embutir. Extraído
// pra módulo porque `fetchOrderById` (usado pela impressão automática, que
// escuta pedido novo em qualquer tela, não só em /pedidos) precisa do mesmo
// formato de linha que o board usa.
const ORDER_SELECT =
  "id, customer_name, table_label, pickup_code, delivery_address, status, order_type, payment_status, payment_method, notes, subtotal, discount_amount, service_charge_amount, total, created_at, status_changed_at, order_items(id, quantity, unit_price, half_flavor_name, notes, products!order_items_product_id_fkey(name), order_item_addons(name, quantity, unit_price), order_item_combo_choices(group_name, option_name), order_item_removed_ingredients(ingredient_name))";

type RawItem = {
  id: string;
  quantity: number;
  unit_price: number;
  half_flavor_name: string | null;
  notes: string | null;
  products: { name: string } | null;
  order_item_addons: { name: string; quantity: number; unit_price: number }[];
  order_item_combo_choices: { group_name: string; option_name: string }[];
  order_item_removed_ingredients: { ingredient_name: string }[];
};
type RawOrder = {
  id: string;
  customer_name: string | null;
  table_label: string | null;
  pickup_code: string | null;
  delivery_address: { text: string } | null;
  status: OrderStatus;
  order_type: OrderType;
  payment_status: string;
  payment_method: PaymentMethod | null;
  notes: string | null;
  subtotal: number;
  discount_amount: number;
  service_charge_amount: number;
  total: number;
  created_at: string;
  status_changed_at: string;
  order_items: RawItem[];
};

function mapRawOrder(order: RawOrder): IncomingOrder {
  return {
    id: order.id,
    customer_name: order.customer_name ?? "Sem nome",
    table_label: order.table_label ?? "?",
    pickup_code: order.pickup_code,
    delivery_address: order.delivery_address,
    status: order.status,
    order_type: order.order_type,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
    notes: order.notes,
    subtotal: Number(order.subtotal),
    discount_amount: Number(order.discount_amount),
    service_charge_amount: Number(order.service_charge_amount),
    total: Number(order.total),
    created_at: order.created_at,
    status_changed_at: order.status_changed_at,
    items: order.order_items.map((item) => ({
      id: item.id,
      product_name: item.products?.name ?? "Produto removido",
      quantity: item.quantity,
      unit_price: Number(item.unit_price),
      half_flavor_name: item.half_flavor_name,
      notes: item.notes,
      addons: item.order_item_addons.map((a) => ({ name: a.name, quantity: a.quantity, unit_price: Number(a.unit_price) })),
      combo_choices: item.order_item_combo_choices.map((c) => ({ group_name: c.group_name, option_name: c.option_name })),
      removed_ingredients: item.order_item_removed_ingredients.map((r) => r.ingredient_name),
    })),
  };
}

// Busca um pedido completo (com itens/addons/combos) por id — usado pela
// impressão automática (`useAutoPrintOnNewOrders`), que escuta pedido novo a
// partir do layout, não do board, e por isso não tem a lista inteira de
// `orders` carregada como o board tem.
export async function fetchOrderById(orderId: string): Promise<IncomingOrder | null> {
  const { data } = await supabase.from("orders").select(ORDER_SELECT).eq("id", orderId).single();
  if (!data) return null;
  return mapRawOrder(data as unknown as RawOrder);
}

// Cada pedido é seu próprio ticket, cobrado individualmente — não existe mais
// comanda/sessão agrupando vários pedidos da mesma mesa. Mostra o dia de hoje
// inteiro (todos os status, inclusive concluído/cancelado) — histórico mais
// antigo fica pro Dashboard, não pro board operacional.
export function useIncomingOrders(restaurantId: string | null) {
  const [orders, setOrders] = useState<IncomingOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("restaurant_id", restaurantId)
      .gte("created_at", startOfToday())
      .order("created_at");

    setOrders(((data ?? []) as unknown as RawOrder[]).map(mapRawOrder));
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Tempo real: pedido novo ou mudança de status em qualquer tela recarrega
  // o board sozinho, sem precisar apertar nada — respeita a mesma RLS de
  // leitura que a query acima já usa. Som e impressão automática de pedido
  // novo não vivem mais aqui — ver `useAutoPrintOnNewOrders`, que escuta o
  // mesmo INSERT só que a partir do layout, então funciona mesmo com o
  // board fechado.
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, load]);

  async function advanceStatus(orderId: string, next: OrderStatus) {
    await supabase
      .from("orders")
      .update({
        status: next,
        status_changed_at: new Date().toISOString(),
        ...(next === "completed" ? { payment_status: "paid" } : {}),
      })
      .eq("id", orderId);
    await load();
  }

  async function cancelOrder(orderId: string) {
    await supabase
      .from("orders")
      .update({ status: "cancelled", status_changed_at: new Date().toISOString() })
      .eq("id", orderId);
    await load();
  }

  // Só grava forma de pagamento/status — sem recálculo de preço, então a
  // policy orders_staff_update já cobre, não precisa de Edge Function.
  async function registerPayment(orderId: string, method: PaymentMethod) {
    await supabase.from("orders").update({ payment_method: method, payment_status: "paid" }).eq("id", orderId);
    await load();
  }

  return {
    orders,
    loading,
    reload: load,
    advanceStatus,
    cancelOrder,
    registerPayment,
  };
}
