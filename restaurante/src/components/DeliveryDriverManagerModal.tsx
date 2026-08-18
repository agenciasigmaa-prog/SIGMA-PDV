import { useState } from "react";
import { X } from "lucide-react";
import type { DeliveryDriver } from "../lib/deliveryDrivers";
import { ConfirmDialog } from "./ConfirmDialog";

// Cadastro simples de motoboys — nome + ativo/inativo, sem senha/login.
// Desativar não apaga (soft-disable), mantém o histórico de pedidos íntegro
// via FK `orders.delivery_driver_id`. Avisa (não bloqueia) ao desativar
// alguém com pedido aberto — mesmo padrão de WaiterManagerModal.
export function DeliveryDriverManagerModal({
  drivers,
  openOrderCountByDriver,
  onCreate,
  onSetActive,
  onClose,
}: {
  drivers: DeliveryDriver[];
  openOrderCountByDriver: Record<string, number>;
  onCreate: (name: string) => Promise<{ ok: boolean; error?: string }>;
  onSetActive: (driverId: string, active: boolean) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<DeliveryDriver | null>(null);

  async function handleCreate() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await onCreate(name.trim());
    if (!result.ok) setError(result.error ?? "Erro ao criar motoboy");
    else setName("");
    setBusy(false);
  }

  async function applyToggle(driver: DeliveryDriver) {
    setBusy(true);
    setError(null);
    const result = await onSetActive(driver.id, !driver.active);
    if (!result.ok) setError(result.error ?? "Erro ao atualizar motoboy");
    setBusy(false);
  }

  function handleToggle(driver: DeliveryDriver) {
    if (driver.active && (openOrderCountByDriver[driver.id] ?? 0) > 0) {
      setConfirmDeactivate(driver);
      return;
    }
    applyToggle(driver);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-bold">Gerenciar motoboys</h3>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 flex gap-1.5">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do motoboy"
              className="flex-1 rounded-xl border border-border px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreate}
              disabled={busy || !name.trim()}
              className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
            >
              Adicionar
            </button>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border">
            {drivers.map((driver) => (
              <div key={driver.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <span className={driver.active ? "" : "text-muted-foreground line-through"}>{driver.name}</span>
                <button
                  onClick={() => handleToggle(driver)}
                  disabled={busy}
                  className="rounded-full border border-border px-2 py-1 text-[11px] font-bold hover:bg-muted disabled:opacity-40"
                >
                  {driver.active ? "Desativar" : "Reativar"}
                </button>
              </div>
            ))}
            {drivers.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum motoboy cadastrado</p>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </div>

      {confirmDeactivate && (
        <ConfirmDialog
          title="Desativar motoboy"
          message={`${confirmDeactivate.name} tem ${openOrderCountByDriver[confirmDeactivate.id]} pedido(s) em aberto. Desativar mesmo assim?`}
          confirmLabel="Desativar"
          onCancel={() => setConfirmDeactivate(null)}
          onConfirm={async () => {
            await applyToggle(confirmDeactivate);
            setConfirmDeactivate(null);
          }}
        />
      )}
    </div>
  );
}
