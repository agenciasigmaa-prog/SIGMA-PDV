import { describe, expect, it } from "vitest";
import { type AuditLogEntry, filterAuditEntries, formatAuditDetails } from "./auditLog";

describe("formatAuditDetails", () => {
  it("returns a dash for null details", () => {
    expect(formatAuditDetails(null)).toBe("—");
  });

  it("returns a dash for an empty object", () => {
    expect(formatAuditDetails({})).toBe("—");
  });

  it("formats flat key/value pairs", () => {
    expect(formatAuditDetails({ status: "active" })).toBe("status: active");
    expect(formatAuditDetails({ name: "Burger House", owner_email: "x@y.com" })).toBe(
      "name: Burger House, owner_email: x@y.com",
    );
  });

  it("formats arrays as comma-joined values", () => {
    expect(formatAuditDetails({ changed_fields: ["email", "password"] })).toBe(
      "changed_fields: email, password",
    );
  });

  it("falls back to JSON for nested objects", () => {
    expect(formatAuditDetails({ meta: { a: 1 } })).toBe('meta: {"a":1}');
  });

  it("shows a dash for null/undefined values", () => {
    expect(formatAuditDetails({ user_id: null })).toBe("user_id: —");
  });
});

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: "log-1",
    admin_id: "admin-1",
    target_restaurant_id: "rest-1",
    action: "account_status_changed",
    details: { status: "active" },
    created_at: "2026-01-01T00:00:00Z",
    restaurants: { name: "Burger House" },
    ...overrides,
  };
}

describe("filterAuditEntries", () => {
  const entries = [
    makeEntry({ id: "1", action: "restaurant_created", restaurants: { name: "Burger House" } }),
    makeEntry({ id: "2", action: "account_status_changed", restaurants: { name: "Pizzaria Bella" } }),
  ];

  it("returns everything when the query is empty", () => {
    expect(filterAuditEntries(entries, "")).toHaveLength(2);
  });

  it("matches by action", () => {
    expect(filterAuditEntries(entries, "restaurant_created")).toEqual([entries[0]]);
  });

  it("matches by restaurant name", () => {
    expect(filterAuditEntries(entries, "bella")).toEqual([entries[1]]);
  });
});
