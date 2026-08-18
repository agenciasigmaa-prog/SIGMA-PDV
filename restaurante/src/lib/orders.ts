import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { describeFunctionError } from "./functionError";

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

export type SplitPayment = { method: PaymentMethod; amount: number };

export type OrderPaymentSplit = {
  id: string;
  label: string;
  amount: number;
  payment_method: PaymentMethod | null;
  status: "pending" | "paid";
  paid_at: string | null;
  voided_at: string | null;
  payments: SplitPayment[];
};

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
  delivery_fee_amount: number;
  total: number;
  created_at: string;
  status_changed_at: string;
  items: IncomingOrderItem[];
  payment_splits: OrderPaymentSplit[];
  waiter_id: string | null;
  waiter_name: string | null;
  delivery_driver_id: string | null;
  delivery_driver_name: string | null;
  neighborhood_id: string | null;
  neighborhood_name: string | null;
};

// null = divisão não configurada pro pedido (fluxo de pagamento único normal).
export function splitProgress(order: Pick<IncomingOrder, "payment_splits">): { paid: number; total: number } | null {
  if (order.payment_splits.length === 0) return null;
  return { paid: order.payment_splits.filter((s) => s.status === "paid").length, total: order.payment_splits.length };
}

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
  "id, customer_name, table_label, pickup_code, delivery_address, status, order_type, payment_status, payment_method, notes, subtotal, discount_amount, service_charge_amount, delivery_fee_amount, total, created_at, status_changed_at, waiter_id, waiters(name), delivery_driver_id, delivery_drivers(name), neighborhood_id, neighborhood_name, order_items(id, quantity, unit_price, half_flavor_name, notes, products!order_items_product_id_fkey(name), order_item_addons(name, quantity, unit_price), order_item_combo_choices(group_name, option_name), order_item_removed_ingredients(ingredient_name)), order_payment_splits(id, label, amount, payment_method, status, paid_at, voided_at, order_payment_split_payments(method, amount))";

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
type RawSplit = {
  id: string;
  label: string;
  amount: number;
  payment_method: PaymentMethod | null;
  status: "pending" | "paid";
  paid_at: string | null;
  voided_at: string | null;
  order_payment_split_payments: { method: PaymentMethod; amount: number }[];
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
  delivery_fee_amount: number;
  total: number;
  created_at: string;
  status_changed_at: string;
  waiter_id: string | null;
  waiters: { name: string } | null;
  delivery_driver_id: string | null;
  delivery_drivers: { name: string } | null;
  neighborhood_id: string | null;
  neighborhood_name: string | null;
  order_items: RawItem[];
  order_payment_splits: RawSplit[];
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
    delivery_fee_amount: Number(order.delivery_fee_amount),
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
    payment_splits: (order.order_payment_splits ?? []).map((split) => ({
      id: split.id,
      label: split.label,
      amount: Number(split.amount),
      payment_method: split.payment_method,
      status: split.status,
      paid_at: split.paid_at,
      voided_at: split.voided_at,
      payments: (split.order_payment_split_payments ?? []).map((p) => ({ method: p.method, amount: Number(p.amount) })),
    })),
    waiter_id: order.waiter_id,
    waiter_name: order.waiters?.name ?? null,
    delivery_driver_id: order.delivery_driver_id,
    delivery_driver_name: order.delivery_drivers?.name ?? null,
    neighborhood_id: order.neighborhood_id,
    neighborhood_name: order.neighborhood_name,
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

  // Debounce curto: mark_paid da divisão toca order_payment_splits E orders
  // (quando é a última parte), o que dispararia dois reloads em sequência
  // sem isso — os dois canais abaixo passam por aqui.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 150);
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
        () => scheduleReload(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => scheduleReload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, scheduleReload]);

  // Progresso da divisão de conta (order_payment_splits) muda sem tocar a
  // linha de orders (exceto quando a última parte é paga) — precisa do
  // próprio canal pra outra tela ver o "N de M pagas" em tempo real.
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`order-payment-splits-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "order_payment_splits", filter: `restaurant_id=eq.${restaurantId}` },
        () => scheduleReload(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "order_payment_splits", filter: `restaurant_id=eq.${restaurantId}` },
        () => scheduleReload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, scheduleReload]);

  // Status de fluxo (comida saiu) e status de pagamento são independentes —
  // avançar pra "completed" não marca mais payment_status='paid' sozinho.
  // Pagamento só é confirmado explicitamente pela aba Garçom (markSplitPaid).
  async function advanceStatus(orderId: string, next: OrderStatus): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase
      .from("orders")
      .update({ status: next, status_changed_at: new Date().toISOString() })
      .eq("id", orderId);
    await load();
    return { ok: !error, error: error?.message };
  }

  async function cancelOrder(orderId: string): Promise<{ ok: boolean; error?: string }> {
    // Pode ser rejeitado pelo trigger de banco (guard_order_payment_updates)
    // se o pedido tiver parte da divisão já paga.
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled", status_changed_at: new Date().toISOString() })
      .eq("id", orderId);
    await load();
    return { ok: !error, error: error?.message };
  }

  // Só grava o vínculo — sem recálculo de preço, então a policy
  // orders_staff_update já cobre, não precisa de Edge Function.
  async function assignWaiter(orderId: string, waiterId: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.from("orders").update({ waiter_id: waiterId }).eq("id", orderId);
    await load();
    return { ok: !error, error: error?.message };
  }

  // Compare-and-swap: só assume se ainda estiver não atribuído — sem isso,
  // dois garçons clicando "Assumir" quase juntos fariam o segundo roubar o
  // pedido do primeiro sem aviso nenhum.
  async function claimOrder(orderId: string, waiterId: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase
      .from("orders")
      .update({ waiter_id: waiterId })
      .eq("id", orderId)
      .is("waiter_id", null)
      .select("id");
    await load();
    if (error) return { ok: false, error: error.message };
    if ((data ?? []).length === 0) return { ok: false, error: "Esse pedido já foi assumido por outro garçom" };
    return { ok: true };
  }

  // Mesmo raciocínio de assignWaiter — só grava o vínculo, sem recálculo de
  // preço, então a policy orders_staff_update já cobre.
  async function assignDeliveryDriver(orderId: string, driverId: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.from("orders").update({ delivery_driver_id: driverId }).eq("id", orderId);
    await load();
    return { ok: !error, error: error?.message };
  }

  // Compare-and-swap — mesmo raciocínio de claimOrder, pra dois motoboys não
  // roubarem a mesma entrega um do outro sem aviso.
  async function claimDeliveryOrder(orderId: string, driverId: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase
      .from("orders")
      .update({ delivery_driver_id: driverId })
      .eq("id", orderId)
      .is("delivery_driver_id", null)
      .select("id");
    await load();
    if (error) return { ok: false, error: error.message };
    if ((data ?? []).length === 0) return { ok: false, error: "Esse pedido já foi assumido por outro motoboy" };
    return { ok: true };
  }

  // Cria (ou substitui) a divisão de conta de um pedido. `payload` é o corpo
  // específico do modo (equal/manual/by_item) — ver staff-split-payment.
  async function configureSplit(orderId: string, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.functions.invoke("staff-split-payment", {
      body: { order_id: orderId, action: "configure_split", ...payload },
    });
    if (error) return { ok: false, error: await describeFunctionError(error) };
    await load();
    return { ok: true };
  }

  // `splitId` null = pedido ainda sem divisão configurada; o servidor cria
  // implicitamente um único split cobrindo o total ("Pagamento total").
  // `payments` suporta mais de uma forma cobrindo o mesmo valor (pagamento
  // misto) — precisa somar exatamente o valor da parte.
  async function markSplitPaid(
    orderId: string,
    splitId: string | null,
    payments: SplitPayment[],
  ): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.functions.invoke("staff-split-payment", {
      body: { order_id: orderId, action: "mark_paid", split_id: splitId ?? undefined, payments },
    });
    if (error) return { ok: false, error: await describeFunctionError(error) };
    await load();
    return { ok: true };
  }

  async function voidSplit(orderId: string, splitId: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.functions.invoke("staff-split-payment", {
      body: { order_id: orderId, action: "void_split", split_id: splitId },
    });
    if (error) return { ok: false, error: await describeFunctionError(error) };
    await load();
    return { ok: true };
  }

  return {
    orders,
    loading,
    reload: load,
    advanceStatus,
    cancelOrder,
    assignWaiter,
    claimOrder,
    assignDeliveryDriver,
    claimDeliveryOrder,
    configureSplit,
    markSplitPaid,
    voidSplit,
  };
}
