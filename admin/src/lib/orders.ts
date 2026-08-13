export type OrderType = "dine_in" | "pickup" | "delivery";
export type OrderStatus = "received" | "preparing" | "ready" | "completed" | "cancelled";
export type PaymentMethod = "cash" | "card" | "pix";
export type PaymentStatus = "pending" | "paid";

export type Order = {
  id: string;
  restaurant_id: string;
  order_type: OrderType;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  subtotal: number;
  total: number;
  created_at: string;
  restaurants: { name: string } | null;
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  dine_in: "Salão",
  pickup: "Retirada",
  delivery: "Entrega",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recebido",
  preparing: "Preparando",
  ready: "Pronto",
  completed: "Concluído",
  cancelled: "Cancelado",
};

export const ORDER_STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  received: "bg-accent/20 text-accent-foreground",
  preparing: "bg-accent/20 text-accent-foreground",
  ready: "bg-success/15 text-success",
  completed: "bg-success/15 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  card: "Cartão",
  pix: "Pix",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Pendente",
  paid: "Pago",
};

export function filterOrders(orders: Order[], query: string): Order[] {
  const q = query.trim().toLowerCase();
  if (!q) return orders;
  return orders.filter((order) => order.restaurants?.name.toLowerCase().includes(q));
}
