import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bike, ShoppingBag, Utensils } from "lucide-react";
import { useSession } from "../lib/useSession";
import {
  type ChannelStats,
  type CustomRange,
  type HourBucket,
  type KpiPeriod,
  type ProductSales,
  type StatsPeriod,
  useRestaurantStats,
  type SalesByDay,
} from "../lib/useRestaurantStats";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const axisCurrency = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const CHART_PERIOD_LABEL: Record<StatsPeriod, string> = { week: "Semana", month: "Mês" };
const CHART_PERIOD_ORDER: StatsPeriod[] = ["week", "month"];

const KPI_PERIOD_LABEL: Record<KpiPeriod, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  "7d": "7 dias",
  month: "Este mês",
  custom: "Personalizado",
};
const KPI_PERIOD_ORDER: KpiPeriod[] = ["today", "yesterday", "7d", "month", "custom"];

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

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

function ChannelCard({
  label,
  icon: Icon,
  loading,
  stats,
}: {
  label: string;
  icon: typeof Utensils;
  loading: boolean;
  stats: ChannelStats;
}) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Pedidos</span>
          <span className="font-bold">{loading ? "…" : stats.count}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Faturamento</span>
          <span className="font-bold">{loading ? "…" : currency(stats.value)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Ticket médio</span>
          <span className="font-bold">{loading ? "…" : stats.avgTicket === null ? "—" : currency(stats.avgTicket)}</span>
        </div>
      </div>
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

function TopProductsCard({ products, loading }: { products: ProductSales[]; loading: boolean }) {
  const max = Math.max(1, ...products.map((p) => p.quantity));
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <h3 className="mb-4 border-b border-border pb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Produtos mais vendidos
      </h3>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : products.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sem vendas neste período.</p>
      ) : (
        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.productId}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{p.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {p.quantity}x · {currency(p.revenue)}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(p.quantity / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PeakHoursChart({ hours, loading }: { hours: HourBucket[]; loading: boolean }) {
  const max = Math.max(1, ...hours.map((h) => h.count));
  const peakHour = hours.reduce((best, h, i) => (h.count > hours[best].count ? i : best), 0);
  const hasData = hours.some((h) => h.count > 0);
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <h3 className="mb-4 border-b border-border pb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Horário de pico
      </h3>
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
      ) : !hasData ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Sem vendas neste período.</p>
      ) : (
        <>
          <div className="flex h-32 items-end gap-0.5">
            {hours.map((h) => (
              <div key={h.hour} className="flex-1" title={`${h.hour}h · ${h.count} pedido(s)`}>
                <div
                  className={`rounded-t ${h.hour === peakHour && h.count > 0 ? "bg-primary" : "bg-muted"}`}
                  style={{ height: `${Math.max(2, (h.count / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>0h</span>
            <span>12h</span>
            <span>23h</span>
          </div>
        </>
      )}
    </div>
  );
}

export function Dashboard() {
  const { profile } = useSession();
  const [chartPeriod, setChartPeriod] = useState<StatsPeriod>("week");
  const [kpiPeriod, setKpiPeriod] = useState<KpiPeriod>("today");
  const [customFrom, setCustomFrom] = useState(todayIsoDate);
  const [customTo, setCustomTo] = useState(todayIsoDate);

  const customRange = useMemo<CustomRange | null>(
    () => (kpiPeriod === "custom" ? { from: customFrom, to: customTo } : null),
    [kpiPeriod, customFrom, customTo],
  );

  const {
    loading,
    revenue,
    avgTicket,
    ordersTotal,
    pending,
    completed,
    cancelledCount,
    cancelledValue,
    byChannel,
    cmv,
    lucro,
    unitsSold,
    topProducts,
    ordersByHour,
    salesByDay: chartData,
    hasSalesPeriod,
  } = useRestaurantStats(profile?.restaurant_id ?? null, chartPeriod, kpiPeriod, customRange);

  const totalInChartPeriod = useMemo(() => chartData.reduce((sum, d) => sum + d.total, 0), [chartData]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">{KPI_PERIOD_LABEL[kpiPeriod]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {kpiPeriod === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                max={customTo}
                className="rounded-full border border-border bg-card px-2 py-1.5 text-xs font-bold text-foreground"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                min={customFrom}
                max={todayIsoDate()}
                className="rounded-full border border-border bg-card px-2 py-1.5 text-xs font-bold text-foreground"
              />
            </div>
          )}
          <div className="flex gap-1 rounded-full bg-muted p-1">
            {KPI_PERIOD_ORDER.map((p) => (
              <button
                key={p}
                onClick={() => setKpiPeriod(p)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  kpiPeriod === p ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {KPI_PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Faturamento" value={loading ? "…" : currency(revenue)} />
        <StatCard label="Ticket médio" value={loading ? "…" : avgTicket === null ? "—" : currency(avgTicket)} />
        <StatCard label="Pedidos totais" value={loading ? "…" : String(ordersTotal)} />
        <StatCard label="Pendentes" value={loading ? "…" : String(pending)} />
        <StatCard label="Entregues" value={loading ? "…" : String(completed)} />
        <StatCard
          label="Cancelados"
          value={loading ? "…" : `${cancelledCount} · ${currency(cancelledValue)}`}
        />
      </div>

      <hr className="mb-4 border-border" />

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ChannelCard label="Mesa" icon={Utensils} loading={loading} stats={byChannel.dine_in} />
        <ChannelCard label="Delivery" icon={Bike} loading={loading} stats={byChannel.delivery} />
        <ChannelCard label="Retirada" icon={ShoppingBag} loading={loading} stats={byChannel.pickup} />
      </div>

      <div className="mb-6 rounded-2xl bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between border-b border-border pb-4">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Vendas por dia — {CHART_PERIOD_LABEL[chartPeriod].toLowerCase()}
          </h3>
          <div className="flex items-center gap-1 rounded-full bg-muted p-1">
            {CHART_PERIOD_ORDER.map((p) => (
              <button
                key={p}
                onClick={() => setChartPeriod(p)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  chartPeriod === p ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {CHART_PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
        ) : !hasSalesPeriod || totalInChartPeriod === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Sem vendas neste período.</p>
        ) : (
          <SalesChart data={chartData} />
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopProductsCard products={topProducts} loading={loading} />
        <PeakHoursChart hours={ordersByHour} loading={loading} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Unidades vendidas" value={loading ? "…" : String(unitsSold)} />
        <StatCard label="CMV" value={loading ? "…" : currency(cmv)} />
        <StatCard label="Lucro / Prejuízo" value={loading ? "…" : currency(lucro)} />
      </div>
    </div>
  );
}
