import { CheckCircle2, X, XCircle } from "lucide-react";
import type { MyOrder, MyOrderStatus } from "../lib/myOrder";
import type { OrderType } from "../lib/OrderChannelContext";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Rótulos do progresso variam por canal — "pronto" quer dizer coisas
// diferentes pra quem retira no balcão, come na mesa ou espera em casa.
const STEP_LABELS: Record<OrderType, [string, string, string, string]> = {
  dine_in: ["Recebido", "Em preparo", "Pronto", "Entregue"],
  pickup: ["Recebido", "Em preparo", "Pronto pra retirar", "Retirado"],
  delivery: ["Recebido", "Em preparo", "Saiu pra entrega", "Entregue"],
};

const STEP_STATUSES: MyOrderStatus[] = ["received", "preparing", "ready", "completed"];

function Stepper({ orderType, status }: { orderType: OrderType; status: MyOrderStatus }) {
  const labels = STEP_LABELS[orderType];
  const currentIndex = Math.max(0, STEP_STATUSES.indexOf(status));

  return (
    <div className="flex items-start">
      {labels.map((label, index) => {
        const done = index <= currentIndex;
        const isLast = index === labels.length - 1;
        return (
          <div key={label} className={`flex ${isLast ? "" : "flex-1"} flex-col items-center`}>
            <div className="flex w-full items-center">
              <div
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                  done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {index + 1}
              </div>
              {!isLast && <div className={`h-0.5 flex-1 ${index < currentIndex ? "bg-primary" : "bg-muted"}`} />}
            </div>
            <p className={`mt-1.5 max-w-[72px] text-center text-[11px] font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// Painel "Meu pedido" — mostra o andamento do pedido mais recente do
// cliente logado nesta loja, com destino/detalhe diferente por canal (mesa,
// código de retirada, ou endereço + motoboy). Fica aberto o tempo todo em
// realtime (useMyOrder), então dá pra conferir o status sem recarregar a
// página — diferente do modal "Pedido enviado!" que só aparece uma vez, na
// hora da confirmação.
export function MyOrderSheet({ order, loading, onClose }: { order: MyOrder | null; loading: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Fechar meu pedido" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div className="relative flex h-full w-full max-w-md flex-col bg-background shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-lg font-bold">Meu pedido</h2>
          <button onClick={onClose} aria-label="Fechar" className="press rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

          {!loading && !order && (
            <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido nesta loja.</p>
          )}

          {!loading && order && order.status === "cancelled" && (
            <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-3 text-sm font-medium text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Este pedido foi cancelado.
            </div>
          )}

          {!loading && order && order.status !== "cancelled" && (
            <div className="space-y-1">
              <Stepper orderType={order.orderType} status={order.status} />
              {order.status === "completed" && (
                <div className="mt-3 flex items-center gap-2 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  {order.orderType === "pickup" ? "Retirado — obrigado pela preferência!" : "Entregue — obrigado pela preferência!"}
                </div>
              )}
            </div>
          )}

          {!loading && order && (
            <>
              <div className="mt-5 space-y-1 rounded-xl border border-border p-3 text-sm">
                {order.orderType === "dine_in" && (
                  <p>
                    <span className="text-muted-foreground">Mesa: </span>
                    <span className="font-bold">{order.tableLabel}</span>
                  </p>
                )}
                {order.orderType === "pickup" && order.pickupCode && (
                  <>
                    <p className="text-muted-foreground">Código de retirada</p>
                    <p className="text-2xl font-black tracking-widest text-primary">{order.pickupCode}</p>
                  </>
                )}
                {order.orderType === "delivery" && (
                  <p>
                    <span className="text-muted-foreground">Endereço: </span>
                    {order.deliveryAddressText}
                    {order.neighborhoodName ? ` — ${order.neighborhoodName}` : ""}
                  </p>
                )}
              </div>

              <div className="mt-4 divide-y divide-border rounded-xl border border-border text-sm">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2">
                    <span className="truncate">
                      {item.quantity}x {item.name}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-right text-sm font-bold">Total: {currency(order.total)}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
