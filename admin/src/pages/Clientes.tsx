import { useMemo, useState } from "react";
import { Download, Mail, MapPin, Phone, Search, ShoppingBag, Store, X } from "lucide-react";
import { customerMetrics, useCustomers, type Customer } from "../lib/customers";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

const CHANNEL_LABEL: Record<string, string> = { dine_in: "Mesa", pickup: "Retirada", delivery: "Entrega" };

// Escapa pro formato CSV: só cerca com aspas (dobrando aspas internas) quando
// o valor tem vírgula, aspas ou quebra de linha — senão fica limpo sem aspas.
function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" }); // BOM pro Excel abrir acentuado certo
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

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
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-lg font-bold">{metrics.orderCount}</p>
              <p className="text-[11px] text-muted-foreground">pedidos (todos os restaurantes)</p>
            </div>
            <div className="rounded-xl border border-border p-3 text-center">
              <p className="text-lg font-bold">{currency(metrics.totalSpent)}</p>
              <p className="text-[11px] text-muted-foreground">total gasto na plataforma</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
              <Store className="h-4 w-4 text-primary" aria-hidden /> Restaurantes onde já pediu
            </p>
            <div className="flex flex-wrap gap-1.5">
              {metrics.restaurantNames.map((name) => (
                <span key={name} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                  {name}
                </span>
              ))}
            </div>
          </div>

          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
            <ShoppingBag className="h-4 w-4 text-primary" aria-hidden /> Histórico de pedidos
          </p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {customer.orders.map((order) => (
              <div key={order.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {order.restaurant_name} · {CHANNEL_LABEL[order.order_type] ?? order.order_type}
                  </span>
                  <span className="font-bold">{currency(order.total)}</span>
                </div>
                <p className="text-xs text-muted-foreground">{dateLabel(order.created_at)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Visão cross-tenant do cadastro universal de clientes — mesma ideia da tela
// em restaurante/src/pages/Clientes.tsx, mas sem filtro de restaurante (o
// admin enxerga todo mundo, e cada pedido mostra de qual restaurante veio).
export function Clientes() {
  const { customers, loading } = useCustomers();
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

  // Exportação sempre pega TODOS os clientes cadastrados, não só os filtrados
  // na busca — é uma lista pra levar pra fora (WhatsApp, e-mail marketing),
  // não uma exportação "do que estou vendo agora".
  function handleExportPhones() {
    const rows = [["Nome", "Telefone"]];
    for (const c of customers) if (c.phone) rows.push([c.full_name || "Sem nome", c.phone]);
    downloadCsv("telefones-clientes.csv", rows);
  }

  function handleExportEmails() {
    const rows = [["Nome", "E-mail"]];
    for (const c of customers) if (c.email) rows.push([c.full_name || "Sem nome", c.email]);
    downloadCsv("emails-clientes.csv", rows);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Clientes</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[220px] items-center gap-2 rounded-full bg-muted px-4 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar nome, telefone ou email"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={handleExportPhones}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Exportar telefones
          </button>
          <button
            onClick={handleExportEmails}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" aria-hidden /> Exportar e-mails
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-card shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3">Endereço</th>
              <th className="px-4 py-3">Restaurantes</th>
              <th className="px-4 py-3">Pedidos</th>
              <th className="px-4 py-3">Total gasto</th>
              <th className="px-4 py-3">Último pedido</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Carregando...</td>
              </tr>
            )}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Nenhum cliente cadastrado ainda.</td>
              </tr>
            )}
            {!loading && customers.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">Nenhum cliente encontrado.</td>
              </tr>
            )}
            {!loading &&
              filtered.map((customer) => {
                const metrics = customerMetrics(customer);
                return (
                  <tr
                    key={customer.id}
                    onClick={() => setSelected(customer)}
                    className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3 font-bold">{customer.full_name || "Sem nome"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{customer.email || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{customer.phone || "—"}</td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-xs text-muted-foreground" title={customer.address ?? undefined}>
                      {customer.address || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{metrics.restaurantNames.length}</td>
                    <td className="px-4 py-3">{metrics.orderCount}</td>
                    <td className="px-4 py-3 font-bold">{currency(metrics.totalSpent)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {metrics.lastOrderAt ? dateLabel(metrics.lastOrderAt) : "—"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
