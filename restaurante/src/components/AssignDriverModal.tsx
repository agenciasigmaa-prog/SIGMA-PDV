import { useState } from "react";
import { Bike, X } from "lucide-react";
import type { DeliveryDriver } from "../lib/deliveryDrivers";
import type { IncomingOrder } from "../lib/orders";

// Pergunta qual motoboy assume a entrega no exato momento em que o pedido
// vai pra "Pronto" — antes esse vínculo ficava num select sempre visível no
// card, editável a qualquer momento; reformulado pra só perguntar aqui,
// que é quando essa decisão de verdade precisa ser tomada (a comida tá
// pronta, alguém precisa sair com ela agora).
export function AssignDriverModal({
  order,
  drivers,
  onConfirm,
  onClose,
}: {
  order: IncomingOrder;
  drivers: DeliveryDriver[];
  onConfirm: (driverId: string) => void;
  onClose: () => void;
}) {
  const activeDrivers = drivers.filter((d) => d.active);
  const [driverId, setDriverId] = useState(order.delivery_driver_id ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-elevated">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-base font-bold">
            <Bike className="h-4 w-4" aria-hidden /> Qual motoboy vai assumir?
          </h3>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Entrega de {order.customer_name} — marca como pronto assim que escolher quem vai sair com o pedido.
        </p>

        {activeDrivers.length === 0 ? (
          <p className="mb-4 text-sm text-muted-foreground">
            Nenhum motoboy cadastrado ainda — cadastre um na tela Motoboy pra poder atribuir a entrega.
          </p>
        ) : (
          <div className="mb-4 space-y-1.5">
            {activeDrivers.map((d) => (
              <label key={d.id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
                <input type="radio" name="driver" checked={driverId === d.id} onChange={() => setDriverId(d.id)} />
                {d.name}
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="press rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={() => driverId && onConfirm(driverId)}
            disabled={!driverId}
            className="press rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            Confirmar e marcar pronto
          </button>
        </div>
      </div>
    </div>
  );
}
