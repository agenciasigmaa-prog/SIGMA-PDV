import { useMemo, useState } from "react";
import { Bike, ClipboardList, MapPin, Settings } from "lucide-react";
import { DeliveryOrderModal } from "../components/DeliveryOrderModal";
import { DeliveryDriverManagerModal } from "../components/DeliveryDriverManagerModal";
import { NeighborhoodManagerModal } from "../components/NeighborhoodManagerModal";
import { DeliveryDriverAssignSelect } from "../components/DeliveryDriverAssignSelect";
import { useIncomingOrders, type IncomingOrder } from "../lib/orders";
import { useSelectedDeliveryDriver, useDeliveryDrivers, type DeliveryDriver } from "../lib/deliveryDrivers";
import { useNeighborhoods } from "../lib/neighborhoods";
import { useSession } from "../lib/useSession";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const STATUS_LABEL: Record<string, string> = {
  received: "Recebido",
  preparing: "Em preparo",
  ready: "Pronto",
  completed: "Entregue",
};

function OrderRow({
  order,
  drivers,
  onAssign,
  action,
}: {
  order: IncomingOrder;
  drivers: DeliveryDriver[];
  onAssign: (driverId: string) => void;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-bold">{order.customer_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {STATUS_LABEL[order.status] ?? order.status} · {currency(order.total)}
        </p>
        {order.delivery_address && (
          <p className="mt-0.5 flex items-start gap-1 truncate text-xs text-foreground">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {order.delivery_address.text}
            {order.neighborhood_name && ` — ${order.neighborhood_name}`}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <DeliveryDriverAssignSelect drivers={drivers} driverId={order.delivery_driver_id} onAssign={onAssign} />
        {action}
      </div>
    </div>
  );
}

// Espaço de trabalho de quem está entregando — seletor local "quem está
// entregando" (sem login, só um nome cadastrado em `delivery_drivers`),
// lista dos pedidos daquele motoboy, pedidos de entrega ainda não
// atribuídos com botão "Assumir", e métricas de quanto cada motoboy tem a
// receber (soma de delivery_fee_amount) e quanto em pedidos entregou (soma
// de total), escopadas ao dia de hoje — mesmo escopo de `useIncomingOrders`.
export function Motoboy() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const { drivers, createDriver, setDriverActive } = useDeliveryDrivers(restaurantId);
  const { selectedId, setSelectedId } = useSelectedDeliveryDriver(restaurantId, drivers);
  const { neighborhoods, createNeighborhood, updateNeighborhoodFee, setNeighborhoodActive } = useNeighborhoods(restaurantId);
  const { orders, loading, claimDeliveryOrder, assignDeliveryDriver, advanceStatus } = useIncomingOrders(restaurantId);
  const [showDriverManager, setShowDriverManager] = useState(false);
  const [showNeighborhoodManager, setShowNeighborhoodManager] = useState(false);
  const [detailOrderId, setDetailOrderId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const deliveryOrders = useMemo(() => orders.filter((o) => o.order_type === "delivery"), [orders]);
  const openDeliveryOrders = useMemo(
    () => deliveryOrders.filter((o) => o.status !== "completed" && o.status !== "cancelled"),
    [deliveryOrders],
  );
  const myOrders = useMemo(
    () => openDeliveryOrders.filter((o) => o.delivery_driver_id === selectedId),
    [openDeliveryOrders, selectedId],
  );
  const unassignedOrders = useMemo(
    () => openDeliveryOrders.filter((o) => o.delivery_driver_id === null),
    [openDeliveryOrders],
  );

  const openOrderCountByDriver = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const order of openDeliveryOrders) {
      if (!order.delivery_driver_id) continue;
      counts[order.delivery_driver_id] = (counts[order.delivery_driver_id] ?? 0) + 1;
    }
    return counts;
  }, [openDeliveryOrders]);

  // Métricas por motoboy: pedidos entregues hoje, quanto ele tem a receber
  // (soma da taxa de entrega congelada em cada pedido) e o valor total em
  // pedidos que ele entregou (soma de order.total, não só a taxa).
  const metrics = useMemo(() => {
    const delivered = deliveryOrders.filter((o) => o.status === "completed" && o.delivery_driver_id);
    return drivers
      .filter((d) => d.active || delivered.some((o) => o.delivery_driver_id === d.id))
      .map((driver) => {
        const driverOrders = delivered.filter((o) => o.delivery_driver_id === driver.id);
        return {
          driver,
          orders: driverOrders,
          count: driverOrders.length,
          feesToReceive: driverOrders.reduce((sum, o) => sum + o.delivery_fee_amount, 0),
          totalDelivered: driverOrders.reduce((sum, o) => sum + o.total, 0),
        };
      });
  }, [deliveryOrders, drivers]);

  const dropdownDrivers = drivers.filter((d) => d.active || d.id === selectedId);
  const detailOrder = detailOrderId ? (orders.find((o) => o.id === detailOrderId) ?? null) : null;

  async function handleClaim(orderId: string) {
    if (!selectedId) return;
    const result = await claimDeliveryOrder(orderId, selectedId);
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
          <h2 className="text-xl font-bold">Motoboy</h2>
          <p className="text-sm text-muted-foreground">Entregas de hoje, quem está com qual pedido e o que cada um tem a receber.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5">
            <Bike className="h-4 w-4 text-muted-foreground" aria-hidden />
            <select
              value={selectedId ?? ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="bg-transparent text-sm font-bold outline-none"
            >
              <option value="">Quem está entregando?</option>
              {dropdownDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowDriverManager(true)}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden /> Gerenciar motoboys
          </button>
          <button
            onClick={() => setShowNeighborhoodManager(true)}
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:bg-muted"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden /> Gerenciar bairros
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
                Selecione quem está entregando pra ver seus pedidos.
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
                    drivers={drivers}
                    onAssign={(driverId) => assignDeliveryDriver(order.id, driverId)}
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
                Nenhum pedido de entrega esperando motoboy.
              </p>
            ) : (
              <div className="space-y-2">
                {unassignedOrders.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    drivers={drivers}
                    onAssign={(driverId) => assignDeliveryDriver(order.id, driverId)}
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

          <div>
            <h3 className="mb-3 text-sm font-bold">Métricas de hoje</h3>
            {metrics.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                Nenhum motoboy cadastrado ainda.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Motoboy</th>
                      <th className="px-3 py-2 font-semibold">Entregas</th>
                      <th className="px-3 py-2 font-semibold">A receber (taxas)</th>
                      <th className="px-3 py-2 font-semibold">Total entregue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map(({ driver, count, feesToReceive, totalDelivered }) => (
                      <tr key={driver.id} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-bold">{driver.name}</td>
                        <td className="px-3 py-2">{count}</td>
                        <td className="px-3 py-2 font-bold">{currency(feesToReceive)}</td>
                        <td className="px-3 py-2">{currency(totalDelivered)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {detailOrder && (
        <DeliveryOrderModal
          order={detailOrder}
          onClose={() => setDetailOrderId(null)}
          onConfirmDelivered={() => advanceStatus(detailOrder.id, "completed")}
        />
      )}

      {showDriverManager && (
        <DeliveryDriverManagerModal
          drivers={drivers}
          openOrderCountByDriver={openOrderCountByDriver}
          onCreate={createDriver}
          onSetActive={setDriverActive}
          onClose={() => setShowDriverManager(false)}
        />
      )}

      {showNeighborhoodManager && (
        <NeighborhoodManagerModal
          neighborhoods={neighborhoods}
          onCreate={createNeighborhood}
          onUpdateFee={updateNeighborhoodFee}
          onSetActive={setNeighborhoodActive}
          onClose={() => setShowNeighborhoodManager(false)}
        />
      )}
    </div>
  );
}
