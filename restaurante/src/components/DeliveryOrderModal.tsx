import { Banknote, CheckCircle2, MapPin, X } from "lucide-react";
import { itemTotal, orderLocationLabel, type IncomingOrder } from "../lib/orders";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAYMENT_LABEL: Record<string, string> = { cash: "Dinheiro", card: "Cartão", pix: "Pix" };

// Tela do motoboy pro pedido — só leitura. De propósito, é um componente
// separado do OrderDetailModal (que permite editar item, desconto, dividir
// conta etc.): o motoboy só pode ver endereço/forma de pagamento e confirmar
// que entregou, nunca mexer no pedido em si.
export function DeliveryOrderModal({
  order,
  onClose,
  onConfirmDelivered,
}: {
  order: IncomingOrder;
  onClose: () => void;
  onConfirmDelivered: () => Promise<{ ok: boolean; error?: string }>;
}) {
  async function handleConfirm() {
    const result = await onConfirmDelivered();
    if (result.ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-bold">{order.customer_name}</h3>
            <p className="text-xs text-muted-foreground">
              {orderLocationLabel(order)} · {currency(order.total)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {order.delivery_address && (
            <div className="mb-4 rounded-xl border border-border p-3">
              <p className="mb-1 flex items-start gap-1.5 text-sm font-bold">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                Endereço de entrega
              </p>
              <p className="text-sm">{order.delivery_address.text}</p>
              {order.neighborhood_name && <p className="text-sm text-muted-foreground">{order.neighborhood_name}</p>}
            </div>
          )}

          <div className="mb-4 rounded-xl border border-border p-3">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-bold">
              <Banknote className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              Forma de pagamento
            </p>
            {order.payment_method ? (
              <p className="text-sm">{PAYMENT_LABEL[order.payment_method] ?? order.payment_method}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Não informada — confirme com o cliente na entrega</p>
            )}
            {order.payment_method === "cash" && (
              <p className="mt-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800">
                Leve troco para {currency(order.total)}
              </p>
            )}
          </div>

          <div className="mb-4 divide-y divide-border rounded-xl border border-border">
            {order.items.map((item) => (
              <div key={item.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">
                    {item.quantity}x {item.product_name}
                    {item.half_flavor_name && <span className="text-muted-foreground"> / {item.half_flavor_name}</span>}
                  </span>
                  <span className="shrink-0 font-bold">{currency(itemTotal(item))}</span>
                </div>
                {item.notes && <p className="mt-0.5 text-xs text-muted-foreground">Obs: {item.notes}</p>}
                {item.addons.map((addon, i) => (
                  <p key={`addon-${i}`} className="text-xs text-muted-foreground">
                    + {addon.quantity}x {addon.name}
                  </p>
                ))}
                {item.removed_ingredients.map((n, i) => (
                  <p key={`removed-${i}`} className="text-xs text-destructive">
                    Sem {n}
                  </p>
                ))}
              </div>
            ))}
          </div>

          {order.notes && (
            <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-xs italic text-muted-foreground">Obs: {order.notes}</p>
          )}

          {order.status === "completed" ? (
            <p className="flex items-center justify-center gap-1.5 rounded-full bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary">
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Entregue
            </p>
          ) : (
            <button
              onClick={handleConfirm}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Confirmar entrega
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
