import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "../lib/supabase";
import { type AuditLogEntry, filterAuditEntries, formatAuditDetails } from "../lib/auditLog";

export function AuditLog() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("admin_action_log")
      .select("*, restaurants(name)")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setEntries((data as unknown as AuditLogEntry[]) ?? []);
        setLoading(false);
      });
  }, []);

  const filteredEntries = useMemo(() => filterAuditEntries(entries, search), [entries, search]);

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold">Log de auditoria</h2>

      <div className="mb-4 flex items-center gap-2 rounded-full bg-muted px-4 py-2">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por ação ou restaurante..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Quando</th>
              <th className="px-4 py-3">Restaurante</th>
              <th className="px-4 py-3">Ação</th>
              <th className="px-4 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Carregando...</td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Nenhuma ação registrada ainda.</td>
              </tr>
            )}
            {!loading && entries.length > 0 && filteredEntries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Nenhuma ação encontrada.</td>
              </tr>
            )}
            {filteredEntries.map((entry) => (
              <tr key={entry.id} className="border-b border-border align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.restaurants?.name ?? "—"}</td>
                <td className="px-4 py-3 font-medium">{entry.action}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{formatAuditDetails(entry.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
