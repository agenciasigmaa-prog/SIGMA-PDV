import { useMemo, useState } from "react";
import { ClipboardList, Settings, UserRound } from "lucide-react";
import { OrderDetailModal } from "../components/OrderDetailModal";
import { WaiterManagerModal } from "../components/WaiterManagerModal";
import { WaiterAssignSelect } from "../components/WaiterAssignSelect";
import { orderLocationLabel, splitProgress, useIncomingOrders, type IncomingOrder } from "../lib/orders";
import { useSelectedWaiter, useWaiters, type Waiter } from "../lib/waiters";
import { useSession } from "../lib/useSession";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto",
};

function OrderRow({
  order,
  waiters,
  onAssign,
  action,
}: {
  order: IncomingOrder;
  waiters: Waiter[];
  onAssign: (waiterId: string) => void;
  action: React.ReactNode;
}) {
  const progress = splitProgress(order);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-bold">{order.customer_name}</p>
          {progress && progress.paid < progress.total && (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              {progress.paid} de {progress.total} pagas
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {orderLocationLabel(order)} · {STATUS_LABEL[order.status] ?? order.status} · {currency(order.total)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <WaiterAssignSelect waiters={waiters} waiterId={order.waiter_id} onAssign={onAssign} />
        {action}
      </div>
    </div>
  );
}

// Espaço de trabalho de quem está atendendo — seletor local "quem está
// atendendo" (sem login, só um nome cadastrado em `waiters`), lista dos
// pedidos daquele garçom, e pedidos ainda não atribuídos com botão
// "Assumir". Reatribuir/transferir garçom e confirmar pagamento também
// existem em /pedidos (mesmo OrderDetailModal) — o balcão pode cobrar direto
// de lá sem precisar passar por aqui.
export function Garcom() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const { waiters, createWaiter, setWaiterActive } = useWaiters(restaurantId);
  const { selectedId, setSelectedId } = useSelectedWaiter(restaurantId, waiters);
  const { orders, loading, claimOrder, assignWaiter, configureSplit, markSplitPaid, voidSplit } = useIncomingOrders(restaurantId);
  const [showManager, setShowManager] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  // Essa tela é toda sobre atendimento de mesa (atribuir garçom, dividir
  // conta) — pedido de retirada/entrega não tem garçom nem faz sentido
  // "assumir" aqui, então nem entra na lista (senão apareceria pra atribuir
  // garçom num pedido que não é de mesa).
  const openOrders = useMemo(
    () => orders.filter((o) => o.order_type === "dine_in" && o.status !== "completed" && o.status !== "cancelled"),
    [orders],
  );
  const myOrders = useMemo(() => openOrders.filter((o) => o.waiter_id === selectedId), [openOrders, selectedId]);
  const unassignedOrders = useMemo(() => openOrders.filter((o) => o.waiter_id === null), [openOrders]);

  const openOrderCountByWaiter = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const order of openOrders) {
      if (!order.waiter_id) continue;
      counts[order.waiter_id] = (counts[order.waiter_id] ?? 0) + 1;
    }
    return counts;
  }, [openOrders]);

  const dropdownWaiters = waiters.filter((w) => w.active || w.id === selectedId);
  const detailOrder = detailOrderId ? (orders.find((o) => o.id === detailOrderId) ?? null) : null;

  async function handleClaim(orderId: string) {
    if (!selectedId) return;
    const result = await claimOrder(orderId, selectedId);
    if (!result.ok) {
      setClaimError(result.error ?? "Não foi possível assumir o pedido");
      setTimeout(() => setClaimError(null), 6000);
    }
  }

  if (!restaurantId) return null;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Garçom</h2>
          <p className="text-sm text-muted-foreground">Seus pedidos, dividir conta e confirmar pagamento.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
            <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden />
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="bg-transparent text-sm font-bold outline-none"
            >
              <option value="">Quem está atendendo?</option>
              {dropdownWaiters.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowManager(true)}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden /> Gerenciar garçons
          </button>
        </div>
      </div>

      {claimError && (
        <p className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {claimError}
        </p>
      )}

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && (
        <div className="space-y-8">
          <div>
            <h3 className="mb-3 text-sm font-bold">Meus pedidos {selectedId && `· ${myOrders.length}`}</h3>
            {!selectedId ? (
              <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                Selecione quem está atendendo pra ver seus pedidos.
              </p>
            ) : myOrders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                Nenhum pedido atribuído a você ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {myOrders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    waiters={waiters}
                    onAssign={(waiterId) => assignWaiter(order.id, waiterId)}
                    action={
                      <button
                        onClick={() => setDetailOrderId(order.id)}
                        aria-label="Detalhes do pedido"
                        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <ClipboardList className="h-4 w-4" aria-hidden />
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-bold">Não atribuídos · {unassignedOrders.length}</h3>
            {unassignedOrders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                Nenhum pedido esperando garçom.
              </p>
            ) : (
              <div className="space-y-2">
                {unassignedOrders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    waiters={waiters}
                    onAssign={(waiterId) => assignWaiter(order.id, waiterId)}
                    action={
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleClaim(order.id)}
                          disabled={!selectedId}
                          className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
                        >
                          Assumir
                        </button>
                        <button
                          onClick={() => setDetailOrderId(order.id)}
                          aria-label="Detalhes do pedido"
                          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ClipboardList className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          restaurantId={restaurantId}
          onClose={() => setDetailOrderId(null)}
          onConfigureSplit={configureSplit}
          onMarkSplitPaid={markSplitPaid}
          onVoidSplit={voidSplit}
          waiters={waiters}
          onAssignWaiter={assignWaiter}
        />
      )}

      {showManager && (
        <WaiterManagerModal
          waiters={waiters}
          openOrderCountByWaiter={openOrderCountByWaiter}
          onCreate={createWaiter}
          onSetActive={setWaiterActive}
          onClose={() => setShowManager(false)}
        />
      )}
    </div>
  );
}
