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
  const [restaurantFilter, setRestaurantFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [unitsSold, setUnitsSold] = useState<number | null>(null);
  const [revenue, setRevenue] = useState<number | null>(null);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);

  useEffect(() => {
    async function loadSales() {
      setLoadingSales(true);

      // created_at é timestamptz — "até" o dia escolhido precisa incluir o dia
      // inteiro, não só 00:00, senão pedidos daquele próprio dia ficam de fora.
      const fromIso = dateFrom ? new Date(`${dateFrom}T00:00:00`).toISOString() : null;
      const toIso = dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : null;

      let ordersQuery = supabase.from("orders").select("restaurant_id, total, created_at, restaurants(name)").eq("payment_status", "paid");
      if (restaurantFilter !== "all") ordersQuery = ordersQuery.eq("restaurant_id", restaurantFilter);
      if (fromIso) ordersQuery = ordersQuery.gte("created_at", fromIso);
      if (toIso) ordersQuery = ordersQuery.lte("created_at", toIso);
      const { data: orders } = await ordersQuery;

      let itemsQuery = supabase.from("order_items").select("quantity, orders!inner(restaurant_id, created_at)");
      if (restaurantFilter !== "all") itemsQuery = itemsQuery.eq("orders.restaurant_id", restaurantFilter);
      if (fromIso) itemsQuery = itemsQuery.gte("orders.created_at", fromIso);
      if (toIso) itemsQuery = itemsQuery.lte("orders.created_at", toIso);
      const { data: items } = await itemsQuery;
      const totalUnits = (items ?? []).reduce((sum, item) => sum + item.quantity, 0);
      setUnitsSold(totalUnits);

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
  }, [restaurantFilter, dateFrom, dateTo]);

  const activeCount = restaurants.filter((restaurant) => restaurant.status === "active").length;
  const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Dashboard</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={restaurantFilter}
            onChange={(event) => setRestaurantFilter(event.target.value)}
            className="rounded-full border border-border bg-card px-3 py-2 text-sm"
          >
            <option value="all">Todos os restaurantes</option>
            {restaurants.map((restaurant) => (
              <option key={restaurant.id} value={restaurant.id}>
                {restaurant.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
            aria-label="De"
            className="rounded-full border border-border bg-card px-3 py-2 text-sm"
          />
          <span className="text-sm text-muted-foreground">até</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
            aria-label="Até"
            className="rounded-full border border-border bg-card px-3 py-2 text-sm"
          />
          {(restaurantFilter !== "all" || dateFrom || dateTo) && (
            <button
              onClick={() => {
                setRestaurantFilter("all");
                setDateFrom("");
                setDateTo("");
              }}
              className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

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
            Sem pedidos pagos registrados nesse filtro — o ranking aparece assim que houver vendas reais.
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
