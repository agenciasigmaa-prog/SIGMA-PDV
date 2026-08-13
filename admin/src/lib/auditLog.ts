export type AuditLogEntry = {
  id: string;
  admin_id: string;
  target_restaurant_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  restaurants: { name: string } | null;
};

export function formatAuditDetails(details: Record<string, unknown> | null): string {
  if (!details || Object.keys(details).length === 0) return "—";
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(", ");
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(formatValue).join(", ") || "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function filterAuditEntries(entries: AuditLogEntry[], query: string): AuditLogEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    (entry) => entry.action.toLowerCase().includes(q) || entry.restaurants?.name.toLowerCase().includes(q),
  );
}
