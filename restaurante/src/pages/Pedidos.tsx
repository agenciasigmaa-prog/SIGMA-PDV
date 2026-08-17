import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, CheckCircle2, ClipboardList, MapPin, Plus, Printer, ShoppingBag, Utensils, X } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ManualOrderModal } from "../components/ManualOrderModal";
import { OrderDetailModal } from "../components/OrderDetailModal";
import {
  itemTotal,
  nextStatus,
  orderLocationLabel,
  useIncomingOrders,
  STATUS_ORDER,
  type IncomingOrder,
  type OrderStatus,
  type OrderType,
} from "../lib/orders";
import { useSession } from "../lib/useSession";
import { playOrderSound } from "../lib/orderSound";
import { supabase } from "../lib/supabase";
import { describeAgentError, getAgentConfig, printOrder, probeAgent } from "../lib/printAgent";

const STATUS_LABEL: Record<OrderStatus, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto",
  completed: "Entregue",
  cancelled: "Cancelado",
};

const CHANNEL_LABEL: Record<OrderType, string> = { dine_in: "Mesa", pickup: "Retirada", delivery: "Entrega" };
const CHANNEL_ICON: Record<OrderType, typeof Utensils> = { dine_in: Utensils, pickup: ShoppingBag, delivery: Bike };
const CHANNEL_BADGE_CLASS: Record<OrderType, string> = {
  dine_in: "bg-blue-100 text-blue-700",
  pickup: "bg-emerald-100 text-emerald-700",
  delivery: "bg-violet-100 text-violet-700",
};

function ChannelBadge({ type }: { type: OrderType }) {
  const Icon = CHANNEL_ICON[type];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${CHANNEL_BADGE_CLASS[type]}`}
    >
      <Icon className="h-3 w-3" aria-hidden /> {CHANNEL_LABEL[type]}
    </span>
  );
}

const COLUMNS: OrderStatus[] = [...STATUS_ORDER, "cancelled"];

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function timeAgo(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${rest > 0 ? ` ${rest}min` : ""}`;
}

// Alerta de pedido parado: só nos status ativos (entregue/cancelado são
// terminais, não faz sentido cobrar demora deles).
function staleLevel(order: IncomingOrder): "none" | "warning" | "danger" {
  if (order.status === "completed" || order.status === "cancelled") return "none";
  const minutes = (Date.now() - new Date(order.status_changed_at).getTime()) / 60000;
  if (minutes >= 30) return "danger";
  if (minutes >= 15) return "warning";
  return "none";
}

function OrderCard({
  order,
  onAdvance,
  onCancel,
  onDetail,
  onPrint,
}: {
  order: IncomingOrder;
  onAdvance: () => void;
  onCancel: () => void;
  onDetail: () => void;
  onPrint: () => void;
}) {
  const next = nextStatus(order.status);
  const canCancel = order.status !== "completed" && order.status !== "cancelled";
  const alertLevel = staleLevel(order);
  const borderClass =
    alertLevel === "danger" ? "border-destructive" : alertLevel === "warning" ? "border-amber-500" : "border-border";

  return (
    <div className={`rounded-xl border ${borderClass} bg-card p-3 shadow-xs`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <ChannelBadge type={order.order_type} />
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(order.created_at)}</span>
      </div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="min-w-0 truncate text-sm font-bold">{order.customer_name}</h4>
      </div>
      <p className="mb-2 border-b border-border pb-2 text-xs text-muted-foreground">
        {orderLocationLabel(order)} · há {timeAgo(order.status_changed_at)} nesse status
        {alertLevel !== "none" && (
          <span className={`ml-1 font-bold ${alertLevel === "danger" ? "text-destructive" : "text-amber-600"}`}>
            · atrasado
          </span>
        )}
      </p>

      {order.order_type === "delivery" && order.delivery_address && (
        <p className="mb-2 flex items-start gap-1 text-xs font-medium text-foreground">
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {order.delivery_address.text}
        </p>
      )}

      {order.notes && <p className="mb-2 text-xs italic text-muted-foreground">Obs: {order.notes}</p>}

      <ul className="mb-2 space-y-1.5">
        {order.items.map((item) => (
          <li key={item.id} className="text-xs">
            <div className="flex items-center justify-between">
              <span className="text-foreground">
                {item.quantity}x {item.product_name}
                {item.half_flavor_name && <span className="text-muted-foreground"> / {item.half_flavor_name}</span>}
              </span>
              <span className="text-muted-foreground">{currency(itemTotal(item))}</span>
            </div>
            {(item.addons.length > 0 || item.combo_choices.length > 0 || item.removed_ingredients.length > 0) && (
              <ul className="mt-0.5 pl-3">
                {item.addons.map((addon, index) => (
                  <li key={`addon-${index}`} className="text-[11px] text-muted-foreground">
                    + {addon.quantity}x {addon.name}
                  </li>
                ))}
                {item.combo_choices.map((choice, index) => (
                  <li key={`choice-${index}`} className="text-[11px] text-muted-foreground">
                    {choice.group_name}: {choice.option_name}
                  </li>
                ))}
                {item.removed_ingredients.map((name, index) => (
                  <li key={`removed-${index}`} className="text-[11px] text-destructive">
                    Sem {name}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <div className="mb-2 flex items-center justify-between border-t border-border pt-2 text-sm">
        <span className="font-semibold">Total</span>
        <span className="font-bold">{currency(order.total)}</span>
      </div>

      <div className="flex items-center gap-2">
        {next && (
          <button
            onClick={onAdvance}
            className="flex flex-1 items-center justify-center gap-1 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:brightness-105"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> {STATUS_LABEL[next]}
          </button>
        )}
        <button
          onClick={onDetail}
          aria-label="Detalhes do pedido"
          className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ClipboardList className="h-4 w-4" aria-hidden />
        </button>
        <button
          onClick={onPrint}
          aria-label="Imprimir comanda"
          className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Printer className="h-4 w-4" aria-hidden />
        </button>
        {canCancel && (
          <button
            onClick={onCancel}
            aria-label="Cancelar pedido"
            className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

export function Pedidos() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const { orders, loading, advanceStatus, cancelOrder, registerPayment, justInsertedOrderId, clearJustInsertedOrder } =
    useIncomingOrders(restaurantId);
  const [channelFilter, setChannelFilter] = useState<"all" | OrderType>("all");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<IncomingOrder | null>(null);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const [restaurantName, setRestaurantName] = useState("Restaurante");
  const [autoPrint, setAutoPrint] = useState(false);
  const [printWarning, setPrintWarning] = useState<string | null>(null);

  // Deriva do array vivo de `orders` (não guarda o objeto do pedido em si)
  // pra que a edição via staff-edit-order reflita na hora, assim que o
  // realtime recarregar a lista.
  const detailOrder = detailOrderId ? (orders.find((o) => o.id === detailOrderId) ?? null) : null;

  // Reflete "tempo atrás" mesmo sem nenhum evento novo chegar — não depende
  // só do realtime disparar pra atualizar os relógios dos cards.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    supabase
      .from("restaurants")
      .select("name")
      .eq("id", restaurantId)
      .single()
      .then(({ data }) => {
        if (data?.name) setRestaurantName(data.name);
      });
  }, [restaurantId]);

  // Auto-print é lido do config.json do agente local, não de localStorage —
  // é preferência por máquina, salva na tela /impressora. Recarrega quando a
  // aba volta a ficar em foco, pra pegar uma mudança salva em outra aba sem
  // precisar recarregar o board inteiro.
  useEffect(() => {
    let cancelled = false;
    async function loadAutoPrint() {
      const health = await probeAgent();
      if (!health || cancelled) return;
      try {
        const cfg = await getAgentConfig();
        if (!cancelled) setAutoPrint(cfg.autoPrint);
      } catch {
        // Agente respondeu ao /health mas falhou no /config — mantém o
        // auto-print como estava, não vale a pena travar o board por isso.
      }
    }
    loadAutoPrint();
    window.addEventListener("focus", loadAutoPrint);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadAutoPrint);
    };
  }, []);

  // Falha de impressão nunca pode derrubar o board — só avisa, discretamente
  // e por tempo limitado, e some sozinha.
  const printOrderTicket = useCallback(
    (order: IncomingOrder) => {
      printOrder(order, restaurantName).catch((err) => {
        setPrintWarning(`Falha ao imprimir comanda de ${order.customer_name}: ${describeAgentError(err)}`);
        setTimeout(() => setPrintWarning(null), 8000);
      });
    },
    [restaurantName],
  );

  // Pedido novo chegou via realtime (INSERT) — toca um som diferente pra
  // entrega vs. mesa/retirada (não depende de olhar a tela) e, se
  // auto-print estiver ligado, manda a comanda pro agente local sozinho.
  useEffect(() => {
    if (!justInsertedOrderId) return;
    const order = orders.find((o) => o.id === justInsertedOrderId);
    if (order) {
      playOrderSound(order.order_type);
      if (autoPrint) printOrderTicket(order);
      clearJustInsertedOrder();
    }
  }, [justInsertedOrderId, orders, clearJustInsertedOrder, autoPrint, printOrderTicket]);

  const filtered = useMemo(() => {
    let list = channelFilter === "all" ? orders : orders.filter((o) => o.order_type === channelFilter);
    const query = search.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (o) => o.customer_name.toLowerCase().includes(query) || o.table_label.toLowerCase().includes(query),
      );
    }
    return list;
  }, [orders, channelFilter, search]);

  const byStatus = useMemo(() => {
    const map = new Map<OrderStatus, IncomingOrder[]>();
    for (const status of COLUMNS) map.set(status, []);
    for (const order of filtered) map.get(order.status)?.push(order);
    return map;
  }, [filtered]);

  if (!restaurantId) return null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-bold">Pedidos</h2>
            <p className="text-sm text-muted-foreground">Hoje, em tempo real — cada pedido é cobrado individualmente.</p>
          </div>
          <button
            onClick={() => setShowManualOrder(true)}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:brightness-105"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> Novo pedido
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente ou mesa"
            className="w-40 rounded-full border border-border bg-card px-3 py-1.5 text-xs sm:w-48"
          />
          <div className="flex gap-1 rounded-full bg-muted p-1">
            {(["all", "dine_in", "pickup", "delivery"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setChannelFilter(value)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  channelFilter === value ? "bg-card shadow-card" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {value === "all" ? "Todos" : CHANNEL_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {printWarning && (
        <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {printWarning}
        </p>
      )}

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && (
        <div className="scrollbar-none -mx-4 flex divide-x divide-border overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
          {COLUMNS.map((status) => {
            const columnOrders = byStatus.get(status) ?? [];
            const columnTotal = columnOrders.reduce((sum, o) => sum + o.total, 0);
            const oldestStatusChangedAt = columnOrders.reduce<string | null>(
              (oldest, o) => (!oldest || o.status_changed_at < oldest ? o.status_changed_at : oldest),
              null,
            );
            return (
              <div key={status} className="w-[280px] shrink-0 pl-4 first:pl-0 sm:w-[300px]">
                <div className="mb-3 border-b border-border px-1 pb-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold">
                      {STATUS_LABEL[status]} <span className="font-normal text-muted-foreground">· {columnOrders.length}</span>
                    </h3>
                    <span className="text-xs text-muted-foreground">{currency(columnTotal)}</span>
                  </div>
                  {oldestStatusChangedAt && (
                    <p className="text-[11px] text-muted-foreground">mais antigo há {timeAgo(oldestStatusChangedAt)}</p>
                  )}
                </div>
                <div className="space-y-3">
                  {columnOrders.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                      Nenhum pedido
                    </p>
                  ) : (
                    columnOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        onAdvance={() => {
                          const next = nextStatus(order.status);
                          if (next) advanceStatus(order.id, next);
                        }}
                        onCancel={() => setCancelling(order)}
                        onDetail={() => setDetailOrderId(order.id)}
                        onPrint={() => printOrderTicket(order)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showManualOrder && restaurantId && (
        <ManualOrderModal
          restaurantId={restaurantId}
          onClose={() => setShowManualOrder(false)}
          onCreated={() => setShowManualOrder(false)}
        />
      )}

      {detailOrder && restaurantId && (
        <OrderDetailModal
          order={detailOrder}
          restaurantId={restaurantId}
          onClose={() => setDetailOrderId(null)}
          onRegisterPayment={registerPayment}
        />
      )}

      {cancelling && (
        <ConfirmDialog
          title="Cancelar pedido"
          message={`Confirma o cancelamento do pedido de ${cancelling.customer_name} (${orderLocationLabel(cancelling).toLowerCase()})?`}
          confirmLabel="Cancelar pedido"
          onCancel={() => setCancelling(null)}
          onConfirm={async () => {
            await cancelOrder(cancelling.id);
            setCancelling(null);
          }}
        />
      )}
    </div>
  );
}
