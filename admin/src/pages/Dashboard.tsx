import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { STATUS_LABEL, STATUS_ORDER } from "../lib/restaurant";
import { useRestaurants } from "../lib/useRestaurants";

type RankingRow = { restaurant_id: string; restaurant_name: string; revenue: number };

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

export function Dashboard() {
  const { restaurants, loading: loadingRestaurants } = useRestaurants();
  const [unitsSold, setUnitsSold] = useState<number | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);

  useEffect(() => {
    async function loadSales() {
      setLoadingSales(true);

      const { data: items } = await supabase.from("order_items").select("quantity");
      const totalUnits = (items ?? []).reduce((sum, item) => sum + item.quantity, 0);
      setUnitsSold(totalUnits);

      const { data: orders } = await supabase
        .from("orders")
        .select("restaurant_id, total, restaurants(name)")
        .eq("payment_status", "paid");

      const totalRevenue = (orders ?? []).reduce((sum, order) => sum + Number(order.total), 0);
      setRevenue(totalRevenue);

      const byRestaurant = new Map<string, RankingRow>();
      for (const order of orders ?? []) {
        const name = (order as unknown as { restaurants: { name: string } | null }).restaurants?.name ?? "—";
        const current = byRestaurant.get(order.restaurant_id) ?? { restaurant_id: order.restaurant_id, restaurant_name: name, revenue: 0 };
        current.revenue += Number(order.total);
        byRestaurant.set(order.restaurant_id, current);
      }
      setRanking([...byRestaurant.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5));

      setLoadingSales(false);
    }

    loadSales();
  }, []);

  const activeCount = restaurants.filter((restaurant) => restaurant.status === "active").length;
  const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div>
      <h2 className="mb-6 text-xl font-bold">Dashboard</h2>

      <div className="mb-8 grid grid-cols-4 gap-4">
        <StatCard label="Restaurantes ativos" value={loadingRestaurants ? "…" : String(activeCount)} />
        <StatCard label="Total de restaurantes" value={loadingRestaurants ? "…" : String(restaurants.length)} />
        <StatCard label="Unidades vendidas" value={loadingSales ? "…" : String(unitsSold ?? 0)} />
        <StatCard label="Faturamento total" value={loadingSales ? "…" : currency(revenue ?? 0)} />
      </div>

      <div className="mb-8 grid grid-cols-4 gap-4">
        {STATUS_ORDER.map((status) => (
          <StatCard
            key={status}
            label={STATUS_LABEL[status]}
            value={loadingRestaurants ? "…" : String(restaurants.filter((restaurant) => restaurant.status === status).length)}
          />
        ))}
      </div>

      <div className="rounded-2xl bg-card p-5 shadow-card">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">Ranking por faturamento</h3>
        {loadingSales ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : ranking.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem pedidos pagos registrados ainda — o ranking aparece assim que houver vendas reais.
          </p>
        ) : (
          <ol className="space-y-2">
            {ranking.map((row, index) => (
              <li key={row.restaurant_id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="mr-2 font-bold text-muted-foreground">{index + 1}.</span>
                  {row.restaurant_name}
                </span>
                <span className="font-semibold">{currency(row.revenue)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
