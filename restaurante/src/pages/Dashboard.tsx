import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bike, ShoppingBag, Utensils } from "lucide-react";
import { useSession } from "../lib/useSession";
import { type StatsPeriod, useRestaurantStats, type SalesByDay } from "../lib/useRestaurantStats";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const axisCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const PERIOD_LABEL: Record<StatsPeriod, string> = { week: "Semana", month: "Mês" };
const PERIOD_ORDER: StatsPeriod[] = ["week", "month"];

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Utensils }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function formatAxisLabel(dateKey: string, totalBars: number): string {
  const date = new Date(dateKey + "T00:00:00");
  if (totalBars <= 7) {
    const label = date.toLocaleDateString("pt-BR", { weekday: "short" });
    return label.charAt(0).toUpperCase() + label.slice(1).replace(".", "");
  }
  return String(date.getDate());
}

function SalesChart({ data }: { data: SalesByDay[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = 200;
  const leftPad = 52;
  const bottomPad = 22;
  const chartWidth = Math.max(0, width - leftPad);
  const chartHeight = height - bottomPad;
  const max = Math.max(1, ...data.map((d) => d.total));
  const peakIndex = data.reduce((best, d, i) => (d.total > data[best].total ? i : best), 0);
  const slot = data.length ? chartWidth / data.length : 0;
  const barWidth = Math.max(3, Math.min(24, slot - 4));
  const labelStep = data.length <= 7 ? 1 : Math.ceil(data.length / 6);
  const gridFractions = [0, 0.5, 1];

  return (
    <div ref={containerRef} className="relative">
      {width > 0 && (
        <svg width={width} height={height} className="overflow-visible">
          {gridFractions.map((frac) => {
            const y = chartHeight - frac * chartHeight;
            return (
              <g key={frac}>
                <line x1={leftPad} y1={y} x2={width} y2={y} stroke="var(--color-border)" strokeWidth="1" />
                <text x={leftPad - 8} y={y + 3} textAnchor="end" fontSize="10" fill="var(--color-muted-foreground)">
                  {axisCurrency(max * frac)}
                </text>
              </g>
            );
          })}

          {data.map((d, i) => {
            const cx = leftPad + slot * i + slot / 2;
            const barHeight = (d.total / max) * chartHeight;
            const isPeak = i === peakIndex && d.total > 0;

            return (
              <g key={d.date}>
                <rect
                  x={cx - slot / 2}
                  y={0}
                  width={slot}
                  height={chartHeight}
                  fill="transparent"
                  tabIndex={0}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  className="cursor-pointer outline-none"
                />
                <rect
                  x={cx - barWidth / 2}
                  y={chartHeight - barHeight}
                  width={barWidth}
                  height={barHeight}
                  rx="4"
                  fill="var(--color-primary)"
                  opacity={hovered === null || hovered === i ? 1 : 0.5}
                />
                {isPeak && (
                  <text x={cx} y={chartHeight - barHeight - 8} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--color-foreground)">
                    {currency(d.total)}
                  </text>
                )}
                {i % labelStep === 0 && (
                  <text x={cx} y={height - 4} textAnchor="middle" fontSize="10" fill="var(--color-muted-foreground)">
                    {formatAxisLabel(d.date, data.length)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {hovered !== null && width > 0 && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg bg-foreground px-2 py-1 text-xs text-background shadow-elevated"
          style={{ left: leftPad + slot * (hovered + 0.5), top: chartHeight - (data[hovered].total / max) * chartHeight - 8 }}
        >
          <span className="font-semibold">{currency(data[hovered].total)}</span>{" "}
          <span className="opacity-80">{new Date(data[hovered].date + "T00:00:00").toLocaleDateString("pt-BR")}</span>
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const { profile } = useSession();
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const {
    loading,
    revenueToday,
    avgTicketToday,
    ordersTotalToday,
    pendingToday,
    completedToday,
    dineInToday,
    deliveryToday,
    pickupToday,
    cmvToday,
    lucroToday,
    unitsSoldPeriod,
    salesByDay: chartData,
    hasSalesPeriod,
  } = useRestaurantStats(profile?.restaurant_id ?? null, period);

  const totalInPeriod = useMemo(() => chartData.reduce((sum, d) => sum + d.total, 0), [chartData]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">Hoje</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Faturamento do dia" value={loading ? "…" : currency(revenueToday)} />
        <StatCard label="Ticket médio do dia" value={loading ? "…" : avgTicketToday === null ? "—" : currency(avgTicketToday)} />
        <StatCard label="Pedidos totais" value={loading ? "…" : String(ordersTotalToday)} />
        <StatCard label="Pendentes" value={loading ? "…" : String(pendingToday)} />
        <StatCard label="Entregues" value={loading ? "…" : String(completedToday)} />
      </div>

      <div className="mb-8 grid grid-cols-3 gap-4">
        <StatCard label="Mesa" value={loading ? "…" : String(dineInToday)} icon={Utensils} />
        <StatCard label="Delivery" value={loading ? "…" : String(deliveryToday)} icon={Bike} />
        <StatCard label="Retirada" value={loading ? "…" : String(pickupToday)} icon={ShoppingBag} />
      </div>

      <div className="mb-6 rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Vendas por dia — {PERIOD_LABEL[period].toLowerCase()}
          </h3>
          <div className="flex items-center gap-1 rounded-full bg-muted p-1">
            {PERIOD_ORDER.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  period === p ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : !hasSalesPeriod || totalInPeriod === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem vendas neste período.</p>
        ) : (
          <SalesChart data={chartData} />
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label={`Unidades vendidas — ${PERIOD_LABEL[period].toLowerCase()}`} value={loading ? "…" : String(unitsSoldPeriod)} />
        <StatCard label="CMV do dia" value={loading ? "…" : currency(cmvToday)} />
        <StatCard label="Lucro / Prejuízo do dia" value={loading ? "…" : currency(lucroToday)} />
      </div>
    </div>
  );
}
