import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  ORDER_STATUS_BADGE_CLASS,
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  PAYMENT_STATUS_LABEL,
  filterOrders,
  type OrderStatus,
} from "../lib/orders";
import { useOrders } from "../lib/useOrders";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function Orders() {
  const { orders, loading } = useOrders();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");

  const filteredOrders = useMemo(() => {
    const byName = filterOrders(orders, search);
    return statusFilter === "all" ? byName : byName.filter((order) => order.status === statusFilter);
  }, [orders, search, statusFilter]);

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold">Pedidos</h2>

      <div className="mb-4 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full bg-muted px-4 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por restaurante..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "all")}
          className="rounded-full border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="all">Todos os status</option>
          {Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Restaurante</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Data</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Carregando...</td>
              </tr>
            )}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Nenhum pedido registrado ainda.</td>
              </tr>
            )}
            {!loading && orders.length > 0 && filteredOrders.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Nenhum pedido encontrado.</td>
              </tr>
            )}
            {filteredOrders.map((order) => (
              <tr key={order.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{order.restaurants?.name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{ORDER_TYPE_LABEL[order.order_type]}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${ORDER_STATUS_BADGE_CLASS[order.status]}`}>
                    {ORDER_STATUS_LABEL[order.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{PAYMENT_STATUS_LABEL[order.payment_status]}</td>
                <td className="px-4 py-3 font-semibold">{currency(order.total)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(order.created_at).toLocaleString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
