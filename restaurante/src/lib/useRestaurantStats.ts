import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type StatsPeriod = "week" | "month";
// Período dos KPIs do topo do dashboard — separado do StatsPeriod acima, que
// só controla o gráfico de vendas por dia (não faz sentido acoplar os dois:
// um período de 1 dia não vira gráfico de tendência útil).
export type KpiPeriod = "today" | "yesterday" | "7d" | "month" | "custom";
export type OrderStatus = "received" | "preparing" | "ready" | "completed" | "cancelled";
export type OrderType = "dine_in" | "pickup" | "delivery";

export type OrderItemRecord = { quantity: number; product_id: string; unit_price: number; product_name: string };

export type OrderRecord = {
  id: string;
  total: number;
  status: OrderStatus;
  order_type: OrderType;
  created_at: string;
  order_items: OrderItemRecord[];
};

export type SalesByDay = { date: string; total: number };
export type ChannelStats = { count: number; value: number; avgTicket: number | null };
export type CustomRange = { from: string; to: string };

const PERIOD_DAYS: Record<StatsPeriod, number> = { week: 7, month: 30 };

export function startOfToday(now = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function periodCutoff(period: StatsPeriod, now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - PERIOD_DAYS[period]);
  return cutoff;
}

// Intervalo [start, end] usado pelos KPIs do topo. "month" é o mês corrente
// de calendário (dia 1 até agora), não 30 dias rolantes — é o que o Saipos
// chama de "Mês atual".
export function kpiRange(period: KpiPeriod, custom: CustomRange | null, now = new Date()): { start: Date; end: Date } {
  if (period === "yesterday") {
    const end = startOfToday(now);
    const start = new Date(end);
    start.setDate(start.getDate() - 1);
    return { start, end };
  }
  if (period === "7d") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { start, end: now };
  }
  if (period === "month") {
    const start = new Date(now);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { start, end: now };
  }
  if (period === "custom" && custom) {
    return { start: new Date(custom.from + "T00:00:00"), end: new Date(custom.to + "T23:59:59.999") };
  }
  return { start: startOfToday(now), end: now };
}

function isBilled(order: OrderRecord): boolean {
  return order.status !== "cancelled";
}

export function dailyRevenue(orders: OrderRecord[]): number {
  return orders.filter(isBilled).reduce((sum, o) => sum + o.total, 0);
}

export function billedCount(orders: OrderRecord[]): number {
  return orders.filter(isBilled).length;
}

export function averageTicket(orders: OrderRecord[]): number | null {
  const count = billedCount(orders);
  return count === 0 ? null : dailyRevenue(orders) / count;
}

export function countByStatus(orders: OrderRecord[], statuses: OrderStatus[]): number {
  return orders.filter((o) => statuses.includes(o.status)).length;
}

export function countByType(orders: OrderRecord[], type: OrderType): number {
  return orders.filter((o) => o.order_type === type).length;
}

export function sumUnitsSold(orders: OrderRecord[]): number {
  return orders.filter(isBilled).reduce((sum, o) => sum + o.order_items.reduce((s, item) => s + item.quantity, 0), 0);
}

export function cmvForOrders(orders: OrderRecord[], cmvByProduct: Map<string, number>): number {
  return orders
    .filter(isBilled)
    .reduce(
      (sum, order) =>
        sum + order.order_items.reduce((s, item) => s + item.quantity * (cmvByProduct.get(item.product_id) ?? 0), 0),
      0,
    );
}

export function cancelledStats(orders: OrderRecord[]): { count: number; value: number } {
  const cancelled = orders.filter((o) => o.status === "cancelled");
  return { count: cancelled.length, value: cancelled.reduce((sum, o) => sum + o.total, 0) };
}

export function statsByChannel(orders: OrderRecord[], type: OrderType): ChannelStats {
  const ofType = orders.filter((o) => o.order_type === type);
  return { count: ofType.length, value: dailyRevenue(ofType), avgTicket: averageTicket(ofType) };
}

export type ProductSales = { productId: string; name: string; quantity: number; revenue: number };

export function topProducts(orders: OrderRecord[], limit = 5): ProductSales[] {
  const map = new Map<string, ProductSales>();
  for (const order of orders) {
    if (!isBilled(order)) continue;
    for (const item of order.order_items) {
      const existing = map.get(item.product_id) ?? {
        productId: item.product_id,
        name: item.product_name,
        quantity: 0,
        revenue: 0,
      };
      existing.quantity += item.quantity;
      existing.revenue += item.quantity * item.unit_price;
      map.set(item.product_id, existing);
    }
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity).slice(0, limit);
}

export type HourBucket = { hour: number; count: number };

// Hora local do navegador (é a hora que importa pro staff que está olhando a
// tela, não UTC).
export function ordersByHour(orders: OrderRecord[]): HourBucket[] {
  const counts = new Array(24).fill(0) as number[];
  for (const order of orders) {
    if (!isBilled(order)) continue;
    counts[new Date(order.created_at).getHours()]++;
  }
  return counts.map((count, hour) => ({ hour, count }));
}

function dayKey(isoDate: string): string {
  return isoDate.slice(0, 10);
}

export function salesByDay(orders: OrderRecord[], period: StatsPeriod, now = new Date()): SalesByDay[] {
  const days = PERIOD_DAYS[period];
  const totalsByDay = new Map<string, number>();
  for (const order of orders) {
    if (!isBilled(order)) continue;
    const key = dayKey(order.created_at);
    totalsByDay.set(key, (totalsByDay.get(key) ?? 0) + order.total);
  }

  const result: SalesByDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = dayKey(date.toISOString());
    result.push({ date: key, total: totalsByDay.get(key) ?? 0 });
  }
  return result;
}

// order_items tem duas FKs pra products (product_id e half_flavor_product_id)
// — precisa nomear a constraint pra o PostgREST saber qual embutir.
const ORDER_FIELDS =
  "id, total, status, order_type, created_at, order_items(quantity, product_id, unit_price, products!order_items_product_id_fkey(name))";

type RawOrderRecord = {
  id: string;
  total: number;
  status: OrderStatus;
  order_type: OrderType;
  created_at: string;
  order_items: { quantity: number; product_id: string; unit_price: number; products: { name: string } | null }[];
};

function mapOrderRecords(data: unknown): OrderRecord[] {
  return ((data as RawOrderRecord[] | null) ?? []).map((order) => ({
    id: order.id,
    total: Number(order.total),
    status: order.status,
    order_type: order.order_type,
    created_at: order.created_at,
    order_items: order.order_items.map((item) => ({
      quantity: item.quantity,
      product_id: item.product_id,
      unit_price: Number(item.unit_price),
      product_name: item.products?.name ?? "Produto removido",
    })),
  }));
}

export function useRestaurantStats(
  restaurantId: string | null,
  chartPeriod: StatsPeriod,
  kpiPeriod: KpiPeriod,
  customRange: CustomRange | null,
) {
  const [kpiOrders, setKpiOrders] = useState<OrderRecord[]>([]);
  const [chartOrders, setChartOrders] = useState<OrderRecord[]>([]);
  const [cmvByProduct, setCmvByProduct] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { start, end } = kpiRange(kpiPeriod, customRange);
    const chartStart = periodCutoff(chartPeriod);

    Promise.all([
      supabase
        .from("orders")
        .select(ORDER_FIELDS)
        .eq("restaurant_id", restaurantId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString()),
      supabase.from("orders").select(ORDER_FIELDS).eq("restaurant_id", restaurantId).gte("created_at", chartStart.toISOString()),
    ]).then(async ([kpiRes, chartRes]) => {
      const kpi = mapOrderRecords(kpiRes.data);
      const chart = mapOrderRecords(chartRes.data);
      setKpiOrders(kpi);
      setChartOrders(chart);

      // CMV só é calculado pro conjunto de KPIs (é o que os cards mostram) —
      // evita buscar custo de produto pra janela do gráfico sem necessidade.
      const productIds = [...new Set(kpi.flatMap((order) => order.order_items.map((item) => item.product_id)))];
      if (productIds.length > 0) {
        const { data: cmvRows } = await supabase.from("product_cmv").select("product_id, cmv").in("product_id", productIds);
        setCmvByProduct(new Map((cmvRows ?? []).map((row) => [row.product_id, Number(row.cmv)])));
      } else {
        setCmvByProduct(new Map());
      }
      setLoading(false);
    });
  }, [restaurantId, chartPeriod, kpiPeriod, customRange]);

  const cmv = cmvForOrders(kpiOrders, cmvByProduct);
  const cancelled = cancelledStats(kpiOrders);

  return {
    loading,
    revenue: dailyRevenue(kpiOrders),
    avgTicket: averageTicket(kpiOrders),
    ordersTotal: kpiOrders.length,
    pending: countByStatus(kpiOrders, ["received", "preparing", "ready"]),
    completed: countByStatus(kpiOrders, ["completed"]),
    cancelledCount: cancelled.count,
    cancelledValue: cancelled.value,
    byChannel: {
      dine_in: statsByChannel(kpiOrders, "dine_in"),
      delivery: statsByChannel(kpiOrders, "delivery"),
      pickup: statsByChannel(kpiOrders, "pickup"),
    },
    cmv,
    topProducts: topProducts(kpiOrders),
    ordersByHour: ordersByHour(kpiOrders),
    lucro: dailyRevenue(kpiOrders) - cmv,
    unitsSold: sumUnitsSold(kpiOrders),
    salesByDay: salesByDay(chartOrders, chartPeriod),
    hasSalesPeriod: chartOrders.some(isBilled),
  };
}
