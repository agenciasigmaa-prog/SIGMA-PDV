import { describe, expect, it } from "vitest";
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  filterOrders,
  type Order,
} from "./orders";

// Espelha os enums de supabase/migrations/0001_init.sql — se o schema ganhar um
// valor novo e a UI esquecer de mapear o label, esse teste quebra.
const ORDER_TYPE_VALUES = ["dine_in", "pickup", "delivery"];
const ORDER_STATUS_VALUES = ["received", "preparing", "ready", "completed", "cancelled"];
const PAYMENT_METHOD_VALUES = ["cash", "card", "pix"];
const PAYMENT_STATUS_VALUES = ["pending", "paid"];

describe("label maps cover every DB enum value", () => {
  it("order_type", () => {
    expect(Object.keys(ORDER_TYPE_LABEL).sort()).toEqual([...ORDER_TYPE_VALUES].sort());
  });

  it("order_status", () => {
    expect(Object.keys(ORDER_STATUS_LABEL).sort()).toEqual([...ORDER_STATUS_VALUES].sort());
  });

  it("payment_method", () => {
    expect(Object.keys(PAYMENT_METHOD_LABEL).sort()).toEqual([...PAYMENT_METHOD_VALUES].sort());
  });

  it("payment_status", () => {
    expect(Object.keys(PAYMENT_STATUS_LABEL).sort()).toEqual([...PAYMENT_STATUS_VALUES].sort());
  });
});

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    restaurant_id: "rest-1",
    order_type: "dine_in",
    status: "received",
    payment_method: "pix",
    payment_status: "paid",
    subtotal: 50,
    total: 50,
    created_at: "2026-01-01T00:00:00Z",
    restaurants: { name: "Burger House" },
    ...overrides,
  };
}

describe("filterOrders", () => {
  const orders = [
    makeOrder({ id: "1", restaurants: { name: "Burger House" } }),
    makeOrder({ id: "2", restaurants: { name: "Pizzaria Bella" } }),
  ];

  it("returns everything when the query is empty", () => {
    expect(filterOrders(orders, "")).toHaveLength(2);
  });

  it("matches by restaurant name, case-insensitively", () => {
    expect(filterOrders(orders, "bella")).toEqual([orders[1]]);
  });

  it("doesn't blow up when the restaurant join is missing", () => {
    const orphan = makeOrder({ id: "3", restaurants: null });
    expect(filterOrders([orphan], "anything")).toEqual([]);
    expect(filterOrders([orphan], "")).toEqual([orphan]);
  });
});
