import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type StatsPeriod = "week" | "month";
export type OrderStatus = "received" | "preparing" | "ready" | "completed" | "cancelled";
export type OrderType = "dine_in" | "pickup" | "delivery";

export type OrderItemRecord = { quantity: number; product_id: string };

export type OrderRecord = {
  id: string;
  total: number;
  status: OrderStatus;
  order_type: OrderType;
  created_at: string;
  order_items: OrderItemRecord[];
};

export type SalesByDay = { date: string; total: number };

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

const ORDER_FIELDS = "id, total, status, order_type, created_at, order_items(quantity, product_id)";

export function useRestaurantStats(restaurantId: string | null, period: StatsPeriod) {
  const [todayOrders, setTodayOrders] = useState<OrderRecord[]>([]);
  const [periodOrders, setPeriodOrders] = useState<OrderRecord[]>([]);
  const [cmvByProduct, setCmvByProduct] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const todayCutoff = startOfToday();
    const periodStart = periodCutoff(period);

    Promise.all([
      supabase.from("orders").select(ORDER_FIELDS).eq("restaurant_id", restaurantId).gte("created_at", todayCutoff.toISOString()),
      supabase.from("orders").select(ORDER_FIELDS).eq("restaurant_id", restaurantId).gte("created_at", periodStart.toISOString()),
    ]).then(async ([todayRes, periodRes]) => {
      const today = (todayRes.data as unknown as OrderRecord[]) ?? [];
      const periodData = (periodRes.data as unknown as OrderRecord[]) ?? [];
      setTodayOrders(today);
      setPeriodOrders(periodData);

      // CMV só é calculado pro dia (é o que os KPIs do topo mostram) — evita
      // buscar custo de produto pra toda a janela semana/mês sem necessidade.
      const productIds = [...new Set(today.flatMap((order) => order.order_items.map((item) => item.product_id)))];
      if (productIds.length > 0) {
        const { data: cmvRows } = await supabase.from("product_cmv").select("product_id, cmv").in("product_id", productIds);
        setCmvByProduct(new Map((cmvRows ?? []).map((row) => [row.product_id, Number(row.cmv)])));
      } else {
        setCmvByProduct(new Map());
      }
      setLoading(false);
    });
  }, [restaurantId, period]);

  const cmvToday = cmvForOrders(todayOrders, cmvByProduct);

  return {
    loading,
    revenueToday: dailyRevenue(todayOrders),
    avgTicketToday: averageTicket(todayOrders),
    ordersTotalToday: todayOrders.length,
    pendingToday: countByStatus(todayOrders, ["received", "preparing", "ready"]),
    completedToday: countByStatus(todayOrders, ["completed"]),
    dineInToday: countByType(todayOrders, "dine_in"),
    deliveryToday: countByType(todayOrders, "delivery"),
    pickupToday: countByType(todayOrders, "pickup"),
    cmvToday,
    lucroToday: dailyRevenue(todayOrders) - cmvToday,
    unitsSoldPeriod: sumUnitsSold(periodOrders),
    salesByDay: salesByDay(periodOrders, period),
    hasSalesPeriod: periodOrders.some(isBilled),
  };
}
