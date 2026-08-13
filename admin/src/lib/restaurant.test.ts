import { describe, expect, it } from "vitest";
import { filterRestaurants, nextStatus, type Restaurant } from "./restaurant";

function makeRestaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id: "id-1",
    name: "Burger House",
    status: "onboarding",
    contact_name: "Maria Silva",
    contact_email: "maria@example.com",
    contact_phone: null,
    created_at: "2026-01-01T00:00:00Z",
    last_order_at: null,
    ...overrides,
  };
}

describe("nextStatus", () => {
  it("walks onboarding -> active -> suspended -> cancelled", () => {
    expect(nextStatus("onboarding")).toBe("active");
    expect(nextStatus("active")).toBe("suspended");
    expect(nextStatus("suspended")).toBe("cancelled");
  });

  it("returns null for the terminal status", () => {
    expect(nextStatus("cancelled")).toBeNull();
  });
});

describe("filterRestaurants", () => {
  const restaurants = [
    makeRestaurant({ id: "1", name: "Burger House", contact_name: "Maria Silva", contact_email: "maria@example.com" }),
    makeRestaurant({ id: "2", name: "Pizzaria Bella", contact_name: "João Souza", contact_email: "joao@example.com" }),
  ];

  it("returns everything when the query is empty", () => {
    expect(filterRestaurants(restaurants, "")).toHaveLength(2);
    expect(filterRestaurants(restaurants, "   ")).toHaveLength(2);
  });

  it("matches by restaurant name, case-insensitively", () => {
    expect(filterRestaurants(restaurants, "burger")).toEqual([restaurants[0]]);
    expect(filterRestaurants(restaurants, "BURGER")).toEqual([restaurants[0]]);
  });

  it("matches by contact name", () => {
    expect(filterRestaurants(restaurants, "joão")).toEqual([restaurants[1]]);
  });

  it("matches by contact email", () => {
    expect(filterRestaurants(restaurants, "maria@example.com")).toEqual([restaurants[0]]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterRestaurants(restaurants, "sushi")).toEqual([]);
  });

  it("doesn't blow up when contact fields are null", () => {
    const withNulls = [makeRestaurant({ contact_name: null, contact_email: null })];
    expect(filterRestaurants(withNulls, "burger")).toEqual(withNulls);
    expect(filterRestaurants(withNulls, "nothing-matches")).toEqual([]);
  });
});
