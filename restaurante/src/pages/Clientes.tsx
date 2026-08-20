import { useMemo, useState } from "react";
import { Mail, MapPin, Phone, Search, ShoppingBag, TrendingUp, X } from "lucide-react";
import { customerMetrics, useCustomers, type Customer } from "../lib/customers";
import { useSession } from "../lib/useSession";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const CHANNEL_LABEL: Record<string, string> = { dine_in: "Mesa", pickup: "Retirada", delivery: "Entrega" };

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const metrics = customerMetrics(customer);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-bold">{customer.full_name || "Cliente sem nome"}</h3>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {customer.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" aria-hidden /> {customer.phone}
                </span>
              )}
              {customer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" aria-hidden /> {customer.email}
                </span>
              )}
              {customer.address && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden /> {customer.address}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-lg font-bold">{metrics.orderCount}</p>
              <p className="text-[11px] text-muted-foreground">pedidos</p>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-lg font-bold">{currency(metrics.totalSpent)}</p>
              <p className="text-[11px] text-muted-foreground">total gasto</p>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-lg font-bold">
                {metrics.avgIntervalDays === null ? "—" : `${Math.round(metrics.avgIntervalDays)}d`}
              </p>
              <p className="text-[11px] text-muted-foreground">frequência média</p>
            </div>
          </div>

          {metrics.topProducts.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                <TrendingUp className="h-4 w-4 text-primary" aria-hidden /> Interesses
              </p>
              <div className="flex flex-wrap gap-1.5">
                {metrics.topProducts.map((p) => (
                  <span key={p.name} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                    {p.name} <span className="text-muted-foreground">×{p.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <ShoppingBag className="h-4 w-4 text-primary" aria-hidden /> Histórico de pedidos
          </p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {customer.orders.map((order) => (
              <div key={order.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {CHANNEL_LABEL[order.order_type] ?? order.order_type} · {dateLabel(order.created_at)}
                  </span>
                  <span className="font-bold">{currency(order.total)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{order.items.map((i) => `${i.quantity}x ${i.product_name}`).join(", ")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Cadastro de cliente é universal na plataforma (profiles não é escopado por
// restaurante), mas essa tela só mostra quem já pediu OU já se
// cadastrou/logou no cardápio DESTE restaurante — a query em useCustomers já
// filtra por restaurant_id e a RLS (profiles_select_restaurant_customers) só
// libera ler o perfil de quem tem pedido ou vínculo aqui. A versão do admin
// (admin/src/pages/Clientes.tsx) é a mesma ideia sem esse filtro, já que
// admin enxerga clientes de todos os restaurantes.
export function Clientes() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const { customers, loading } = useCustomers(restaurantId);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter(
      (c) =>
        (c.full_name ?? "").toLowerCase().includes(query) ||
        (c.phone ?? "").toLowerCase().includes(query) ||
        (c.email ?? "").toLowerCase().includes(query),
    );
  }, [customers, search]);

  if (!restaurantId) return null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Clientes</h2>
          <p className="text-sm text-muted-foreground">Quem já pediu ou se cadastrou no seu cardápio — histórico, interesses e frequência.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, telefone ou email"
            className="w-64 rounded-full border border-border bg-card py-2 pl-9 pr-3 text-xs"
          />
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && filtered.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {customers.length === 0 ? "Ninguém se cadastrou ou pediu ainda." : "Nenhum cliente encontrado pra essa busca."}
        </p>
      )}

      {!loading && filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-semibold">Nome</th>
                <th className="px-3 py-2 font-semibold">Contato</th>
                <th className="px-3 py-2 font-semibold">Pedidos</th>
                <th className="px-3 py-2 font-semibold">Total gasto</th>
                <th className="px-3 py-2 font-semibold">Último pedido</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((customer) => {
                const metrics = customerMetrics(customer);
                return (
                  <tr
                    key={customer.id}
                    onClick={() => setSelected(customer)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-3 py-2 font-bold">{customer.full_name || "Sem nome"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{customer.phone || customer.email || "—"}</td>
                    <td className="px-3 py-2">{metrics.orderCount}</td>
                    <td className="px-3 py-2 font-bold">{currency(metrics.totalSpent)}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {metrics.lastOrderAt ? dateLabel(metrics.lastOrderAt) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
