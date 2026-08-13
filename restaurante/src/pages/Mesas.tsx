import { useState } from "react";
import { CheckCircle2, UtensilsCrossed } from "lucide-react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { sessionTotal, useOpenTableSessions, type OpenTableSession } from "../lib/tableSessions";
import { useSession } from "../lib/useSession";

export function Mesas() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const { sessions, loading, closeSession } = useOpenTableSessions(restaurantId);
  const [closing, setClosing] = useState<OpenTableSession | null>(null);

  if (!restaurantId) return null;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold">Mesas</h2>
        <p className="text-sm text-muted-foreground">Comandas abertas pelos clientes via QR Code.</p>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {!loading && sessions.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-16 text-center">
          <UtensilsCrossed className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">Nenhuma mesa com comanda aberta no momento.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sessions.map((session) => (
          <div key={session.id} className="rounded-2xl border border-border bg-card p-4 shadow-xs">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">Mesa {session.table_label}</h3>
              <span className="text-xs text-muted-foreground">
                {new Date(session.opened_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>

            <ul className="mb-3 space-y-2">
              {session.orders.flatMap((order) =>
                order.items.map((item) => {
                  const addonsPerUnit = item.addons.reduce((sum, addon) => sum + addon.unit_price * addon.quantity, 0);
                  const lineTotal = (item.unit_price + addonsPerUnit) * item.quantity;
                  return (
                    <li key={item.id} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground">
                          {item.quantity}x {item.product_name}
                        </span>
                        <span className="text-muted-foreground">R$ {lineTotal.toFixed(2).replace(".", ",")}</span>
                      </div>
                      {item.addons.length > 0 && (
                        <ul className="mt-0.5 pl-4">
                          {item.addons.map((addon, index) => (
                            <li key={index} className="text-xs text-muted-foreground">
                              + {addon.quantity}x {addon.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                }),
              )}
            </ul>

            <div className="mb-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-base font-bold">R$ {sessionTotal(session).toFixed(2).replace(".", ",")}</span>
            </div>

            <button
              onClick={() => setClosing(session)}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-card hover:brightness-105"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Fechar conta
            </button>
          </div>
        ))}
      </div>

      {closing && (
        <ConfirmDialog
          title="Fechar conta"
          message={`Confirma o fechamento da comanda da mesa ${closing.table_label}? Total: R$ ${sessionTotal(closing).toFixed(2).replace(".", ",")}.`}
          confirmLabel="Fechar conta"
          onCancel={() => setClosing(null)}
          onConfirm={async () => {
            await closeSession(closing);
            setClosing(null);
          }}
        />
      )}
    </div>
  );
}
