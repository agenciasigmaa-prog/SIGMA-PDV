import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, CheckCircle2, ClipboardList, Flame, MapPin, Plus, Printer, ShoppingBag, Utensils, X } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ManualOrderModal } from "../components/ManualOrderModal";
import { OrderDetailModal } from "../components/OrderDetailModal";
import { WaiterAssignSelect } from "../components/WaiterAssignSelect";
import { AssignDriverModal } from "../components/AssignDriverModal";
import { AltaDemandaModal } from "../components/AltaDemandaModal";
import {
  itemTotal,
  nextStatus,
  orderLocationLabel,
  splitProgress,
  useIncomingOrders,
  STATUS_ORDER,
  type IncomingOrder,
  type OrderStatus,
  type OrderType,
} from "../lib/orders";
import { useWaiters, type Waiter } from "../lib/waiters";
import { useDeliveryDrivers } from "../lib/deliveryDrivers";
import { useNeighborhoods } from "../lib/neighborhoods";
import { useDemandAdjustment } from "../lib/demandAdjustment";
import { useSession } from "../lib/useSession";
import { useRestaurantName } from "../lib/restaurant";
import { describeAgentError, getExtraPrinterNames, printOrder } from "../lib/printAgent";

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
  waiters,
  onAssignWaiter,
  onAdvance,
  onCancel,
  onDetail,
  onPrint,
}: {
  order: IncomingOrder;
  waiters: Waiter[];
  onAssignWaiter: (waiterId: string) => void;
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
  const progress = splitProgress(order);

  return (
    <div className={`rounded-xl border ${borderClass} bg-card p-3 shadow-xs`}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ChannelBadge type={order.order_type} />
          {progress && progress.paid < progress.total && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {progress.paid} de {progress.total} pagas
            </span>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(order.created_at)}</span>
      </div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h4 className="min-w-0 truncate text-sm font-bold">{order.customer_name}</h4>
        <div className="flex shrink-0 items-center gap-1.5">
          {order.order_type === "dine_in" && (
            <WaiterAssignSelect waiters={waiters} waiterId={order.waiter_id} onAssign={onAssignWaiter} />
          )}
        </div>
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
          <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          {order.delivery_address.text}
          {order.neighborhood_name && ` — ${order.neighborhood_name}`}
        </p>
      )}
      {order.order_type === "delivery" && order.delivery_driver_name && (
        <p className="mb-2 text-xs font-medium text-muted-foreground">Motoboy: {order.delivery_driver_name}</p>
      )}
      {(order.order_type === "delivery" || order.order_type === "dine_in") && order.payment_method === "cash" && (
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          Dinheiro{order.change_for != null ? ` — troco para ${currency(order.change_for)}` : ""}
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

// Corpo de uma coluna (cabeçalho + lista de cards) — reaproveitado pelo
// quadro Kanban lado a lado (desktop) e pela visão de uma coluna por vez
// (celular, ver mobileStatus). Extraído pra não duplicar essa marcação nos
// dois lugares.
function OrderColumnBody({
  status,
  orders,
  waiters,
  onAssignWaiter,
  onAdvance,
  onCancel,
  onDetail,
  onPrint,
}: {
  status: OrderStatus;
  orders: IncomingOrder[];
  waiters: Waiter[];
  onAssignWaiter: (orderId: string, waiterId: string) => void;
  onAdvance: (order: IncomingOrder) => void;
  onCancel: (order: IncomingOrder) => void;
  onDetail: (order: IncomingOrder) => void;
  onPrint: (order: IncomingOrder) => void;
}) {
  const columnTotal = orders.reduce((sum, o) => sum + o.total, 0);
  const oldestStatusChangedAt = orders.reduce<string | null>(
    (oldest, o) => (!oldest || o.status_changed_at < oldest ? o.status_changed_at : oldest),
    null,
  );
  return (
    <>
      <div className="mb-3 border-b border-border px-1 pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">
            {STATUS_LABEL[status]} <span className="font-normal text-muted-foreground">· {orders.length}</span>
          </h3>
          <span className="text-xs text-muted-foreground">{currency(columnTotal)}</span>
        </div>
        {oldestStatusChangedAt && (
          <p className="text-[11px] text-muted-foreground">mais antigo há {timeAgo(oldestStatusChangedAt)}</p>
        )}
      </div>
      <div className="space-y-3">
        {orders.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
            Nenhum pedido
          </p>
        ) : (
          orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              waiters={waiters}
              onAssignWaiter={(waiterId) => onAssignWaiter(order.id, waiterId)}
              onAdvance={() => onAdvance(order)}
              onCancel={() => onCancel(order)}
              onDetail={() => onDetail(order)}
              onPrint={() => onPrint(order)}
            />
          ))
        )}
      </div>
    </>
  );
}

export function Pedidos() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const restaurantName = useRestaurantName(restaurantId);
  const {
    orders,
    loading,
    advanceStatus,
    cancelOrder,
    assignWaiter,
    assignDeliveryDriver,
    configureSplit,
    markSplitPaid,
    voidSplit,
  } = useIncomingOrders(restaurantId);
  const { waiters } = useWaiters(restaurantId);
  const { drivers } = useDeliveryDrivers(restaurantId);
  const { neighborhoods } = useNeighborhoods(restaurantId);
  const { adjustment: demandAdjustment, setAdjustment: saveDemandAdjustment, clearAdjustment: clearDemandAdjustment } =
    useDemandAdjustment(restaurantId);
  const [showAltaDemanda, setShowAltaDemanda] = useState(false);
  const [driverPromptOrder, setDriverPromptOrder] = useState<IncomingOrder | null>(null);
  const [channelFilter, setChannelFilter] = useState<"all" | OrderType>("all");
  // Só usado na visão mobile — desktop mostra todas as colunas lado a lado,
  // celular mostra uma coluna cheia por vez (ver COLUMNS/byStatus abaixo).
  const [mobileStatus, setMobileStatus] = useState<OrderStatus>("received");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<IncomingOrder | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [, forceTick] = useState(0);
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

  // Reimpressão manual (botão na comanda) — a automática, disparada por
  // pedido novo, vive em `useAutoPrintOnNewOrders` (montado no layout, não
  // aqui), pra funcionar mesmo com este board fechado. Falha nunca pode
  // derrubar a tela — só avisa, discretamente e por tempo limitado.
  const printOrderTicket = useCallback(
    (order: IncomingOrder) => {
      printOrder(order, restaurantName, getExtraPrinterNames(restaurantId)).catch((err) => {
        setPrintWarning(`Falha ao imprimir comanda de ${order.customer_name}: ${describeAgentError(err)}`);
        setTimeout(() => setPrintWarning(null), 8000);
      });
    },
    [restaurantName, restaurantId],
  );

  // Avançar pra "Pronto" numa entrega é o momento certo de decidir quem
  // sai com o pedido — em vez de um select sempre visível no card (editável
  // a qualquer hora, mesmo antes de fazer sentido), abre um popup aqui e só
  // avança o status depois que um motoboy for escolhido. Sem motoboy
  // cadastrado, não trava o fluxo: avança direto, igual antes.
  function handleAdvance(order: IncomingOrder) {
    const next = nextStatus(order.status);
    if (!next) return;
    if (order.order_type === "delivery" && next === "ready" && drivers.some((d) => d.active)) {
      setDriverPromptOrder(order);
      return;
    }
    advanceStatus(order.id, next);
  }

  async function handleConfirmDriver(driverId: string) {
    if (!driverPromptOrder) return;
    await assignDeliveryDriver(driverPromptOrder.id, driverId);
    await advanceStatus(driverPromptOrder.id, "ready");
    setDriverPromptOrder(null);
  }

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
      {/* Celular: fica grudado logo abaixo da barra de cima (sticky, mesma
          altura h-14 dela) — só a lista de pedidos rola por baixo disso. No
          desktop volta a ser um bloco normal (md:static), sem esse efeito. */}
      <div className="sticky top-14 z-30 -mx-4 bg-background px-4 pb-4 md:static md:top-auto md:z-auto md:mx-0 md:bg-transparent md:px-0 md:pb-0">
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
            {demandAdjustment ? (
              <button
                onClick={() => setShowAltaDemanda(true)}
                className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-2 text-xs font-bold text-accent-foreground hover:brightness-105"
              >
                <Flame className="h-3.5 w-3.5" aria-hidden /> Alta demanda até{" "}
                {new Date(demandAdjustment.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </button>
            ) : (
              <button
                onClick={() => setShowAltaDemanda(true)}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-bold hover:bg-muted"
              >
                <Flame className="h-3.5 w-3.5" aria-hidden /> Informar alta demanda
              </button>
            )}
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

        {/* Abas de status só no celular — desktop mostra todas as colunas
            lado a lado, não precisa de aba nenhuma. */}
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:hidden">
          {COLUMNS.map((status) => {
            const count = byStatus.get(status)?.length ?? 0;
            return (
              <button
                key={status}
                onClick={() => setMobileStatus(status)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                  mobileStatus === status ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {STATUS_LABEL[status]} · {count}
              </button>
            );
          })}
        </div>
      </div>

      {printWarning && (
        <p className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {printWarning}
        </p>
      )}

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && (
        <>
          {/* Celular: quadro lado a lado não cabe na tela — vira abas por
              status (uma coluna cheia por vez, aba escolhida no cabeçalho
              fixo acima), com contagem em cada aba pra dar visão geral sem
              precisar entrar em cada uma. */}
          <div className="md:hidden">
            <OrderColumnBody
              status={mobileStatus}
              orders={byStatus.get(mobileStatus) ?? []}
              waiters={waiters}
              onAssignWaiter={assignWaiter}
              onAdvance={handleAdvance}
              onCancel={setCancelling}
              onDetail={(order) => setDetailOrderId(order.id)}
              onPrint={printOrderTicket}
            />
          </div>

          {/* Desktop: quadro Kanban completo, todas as colunas lado a lado. */}
          <div className="scrollbar-none -mx-4 hidden divide-x divide-border overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 md:flex">
            {COLUMNS.map((status) => (
              <div key={status} className="w-[280px] shrink-0 pl-4 first:pl-0 sm:w-[300px]">
                <OrderColumnBody
                  status={status}
                  orders={byStatus.get(status) ?? []}
                  waiters={waiters}
                  onAssignWaiter={assignWaiter}
                  onAdvance={handleAdvance}
                  onCancel={setCancelling}
                  onDetail={(order) => setDetailOrderId(order.id)}
                  onPrint={printOrderTicket}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {showManualOrder && restaurantId && (
        <ManualOrderModal
          restaurantId={restaurantId}
          onClose={() => setShowManualOrder(false)}
          onCreated={() => setShowManualOrder(false)}
        />
      )}

      {showAltaDemanda && (
        <AltaDemandaModal
          active={demandAdjustment}
          neighborhoods={neighborhoods}
          onSave={saveDemandAdjustment}
          onClear={clearDemandAdjustment}
          onClose={() => setShowAltaDemanda(false)}
        />
      )}

      {driverPromptOrder && (
        <AssignDriverModal
          order={driverPromptOrder}
          drivers={drivers}
          onConfirm={handleConfirmDriver}
          onClose={() => setDriverPromptOrder(null)}
        />
      )}

      {detailOrder && restaurantId && (
        <OrderDetailModal
          order={detailOrder}
          restaurantId={restaurantId}
          onClose={() => setDetailOrderId(null)}
          onConfigureSplit={configureSplit}
          onMarkSplitPaid={markSplitPaid}
          onVoidSplit={voidSplit}
          waiters={waiters}
          onAssignWaiter={assignWaiter}
          drivers={drivers}
          onAssignDeliveryDriver={assignDeliveryDriver}
        />
      )}

      {cancelError && (
        <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {cancelError}
        </p>
      )}

      {cancelling && (
        <ConfirmDialog
          title="Cancelar pedido"
          message={`Confirma o cancelamento do pedido de ${cancelling.customer_name} (${orderLocationLabel(cancelling).toLowerCase()})?`}
          confirmLabel="Cancelar pedido"
          onCancel={() => setCancelling(null)}
          onConfirm={async () => {
            const result = await cancelOrder(cancelling.id);
            setCancelling(null);
            if (!result.ok) {
              setCancelError(result.error ?? "Não foi possível cancelar o pedido");
              setTimeout(() => setCancelError(null), 8000);
            }
          }}
        />
      )}
    </div>
  );
}
