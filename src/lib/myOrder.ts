import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "./supabase";
import type { OrderType } from "./OrderChannelContext";

export type MyOrderStatus = "received" | "preparing" | "ready" | "completed" | "cancelled";

export type MyOrderItem = { id: string; name: string; quantity: number; prepMinutes: number | null };

export type MyOrderDemandReason = "motoboy_faltou" | "chuva" | "cozinheiro_faltou" | "alta_demanda" | "outro";

export const DEMAND_REASON_LABEL: Record<MyOrderDemandReason, string> = {
  motoboy_faltou: "falta de motoboy",
  chuva: "chuva",
  cozinheiro_faltou: "falta de cozinheiro",
  alta_demanda: "alta demanda",
  outro: "um imprevisto",
};

export type MyOrder = {
  id: string;
  status: MyOrderStatus;
  orderType: OrderType;
  createdAt: string;
  statusChangedAt: string;
  total: number;
  tableLabel: string | null;
  pickupCode: string | null;
  deliveryAddressText: string | null;
  neighborhoodName: string | null;
  demandExtraMinutes: number | null;
  demandReason: MyOrderDemandReason | null;
  items: MyOrderItem[];
};

// Pedido "encerrado" (entregue/retirado/cancelado) some do rastreio depois
// desse tempo — sem isso, abrir o cardápio dias depois (ou só trocar de
// canal pra "delivery" sem ter pedido nada ainda) reexibiria o último
// pedido de uma visita antiga como se estivesse em andamento agora. Só
// pedido ativo (received/preparing/ready) não expira nunca por tempo.
const STALE_TERMINAL_ORDER_MS = 3 * 60 * 60 * 1000;

// products!order_items_product_id_fkey desambigua o embed: order_items tem
// DUAS FKs pra products (product_id e half_flavor_product_id), mesmo padrão
// já usado em restaurante/src/lib/orders.ts. prep_minutes vem junto pra dar
// uma estimativa de "fica pronto às" na retirada — não é congelado no
// pedido (só delivery_fee_amount/demand_* são), então reflete o valor
// atual do produto, o que é aceitável pra uma estimativa exibida, não pra
// cobrança.
// Exportado pra src/lib/orderHistory.ts reaproveitar a mesma query/mapeamento
// em vez de duplicar — só muda o filtro/limite de linhas, a forma da linha é
// idêntica.
export const SELECT =
  "id, status, order_type, created_at, status_changed_at, total, table_label, pickup_code, delivery_address, neighborhood_name, demand_extra_minutes, demand_reason, order_items(id, quantity, products!order_items_product_id_fkey(name, prep_minutes))";

export type OrderRow = {
  id: string;
  status: MyOrderStatus;
  order_type: OrderType;
  created_at: string;
  status_changed_at: string;
  total: number;
  table_label: string | null;
  pickup_code: string | null;
  delivery_address: { text?: string } | null;
  neighborhood_name: string | null;
  demand_extra_minutes: number | null;
  demand_reason: MyOrderDemandReason | null;
  order_items: { id: string; quantity: number; products: { name: string; prep_minutes: number | null } | null }[];
};

export function toMyOrder(row: OrderRow): MyOrder {
  return {
    id: row.id,
    status: row.status,
    orderType: row.order_type,
    createdAt: row.created_at,
    statusChangedAt: row.status_changed_at,
    total: Number(row.total),
    tableLabel: row.table_label,
    pickupCode: row.pickup_code,
    deliveryAddressText: row.delivery_address?.text ?? null,
    neighborhoodName: row.neighborhood_name,
    demandExtraMinutes: row.demand_extra_minutes,
    demandReason: row.demand_reason,
    items: row.order_items.map((item) => ({
      id: item.id,
      name: item.products?.name ?? "Item",
      quantity: item.quantity,
      prepMinutes: item.products?.prep_minutes ?? null,
    })),
  };
}

// Um pedido "conta" pro rastreio se ainda está em andamento, ou se acabou
// de terminar/ser cancelado há pouco tempo (janela curta pra dar tempo do
// cliente ver o "entregue"/"cancelado" sem que um pedido de dias atrás
// volte a aparecer como se fosse de agora).
function isTrackable(row: OrderRow): boolean {
  if (row.status !== "completed" && row.status !== "cancelled") return true;
  return Date.now() - new Date(row.status_changed_at).getTime() < STALE_TERMINAL_ORDER_MS;
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
    const row = data as unknown as OrderRow | null;
    setOrder(row && isTrackable(row) ? toMyOrder(row) : null);
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

  // Reavalia a janela de "encerrado há pouco" mesmo sem evento novo — sem
  // isso, um pedido entregue ficaria "em andamento" pra sempre até a
  // próxima mudança no banco disparar o realtime de novo.
  useEffect(() => {
    const id = setInterval(() => load(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  return { order, loading };
}
