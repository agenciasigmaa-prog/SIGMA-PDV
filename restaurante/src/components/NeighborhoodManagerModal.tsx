import { useState } from "react";
import { X } from "lucide-react";
import type { Neighborhood } from "../lib/neighborhoods";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Cadastro de bairros de entrega + taxa cobrada em cada um. A taxa cobrada
// aqui é a mesma que soma no total do pedido e que o motoboy recebe —
// editar a taxa só vale pra pedidos novos (pedidos já lançados guardam o
// valor congelado em orders.delivery_fee_amount).
export function NeighborhoodManagerModal({
  neighborhoods,
  onCreate,
  onUpdateFee,
  onSetActive,
  onClose,
}: {
  neighborhoods: Neighborhood[];
  onCreate: (name: string, deliveryFee: number) => Promise<{ ok: boolean; error?: string }>;
  onUpdateFee: (neighborhoodId: string, deliveryFee: number) => Promise<{ ok: boolean; error?: string }>;
  onSetActive: (neighborhoodId: string, active: boolean) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [feeEdits, setFeeEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    const feeValue = Number(fee.replace(",", "."));
    if (!name.trim() || !Number.isFinite(feeValue) || feeValue < 0 || busy) return;
    setBusy(true);
    setError(null);
    const result = await onCreate(name.trim(), feeValue);
    if (!result.ok) setError(result.error ?? "Erro ao criar bairro");
    else {
      setName("");
      setFee("");
    }
    setBusy(false);
  }

  async function handleSaveFee(neighborhood: Neighborhood) {
    const raw = feeEdits[neighborhood.id];
    if (raw === undefined) return;
    const feeValue = Number(raw.replace(",", "."));
    if (!Number.isFinite(feeValue) || feeValue < 0) return;
    setBusy(true);
    setError(null);
    const result = await onUpdateFee(neighborhood.id, feeValue);
    if (!result.ok) setError(result.error ?? "Erro ao atualizar taxa");
    else setFeeEdits((prev) => { const next = { ...prev }; delete next[neighborhood.id]; return next; });
    setBusy(false);
  }

  async function handleToggle(neighborhood: Neighborhood) {
    setBusy(true);
    setError(null);
    const result = await onSetActive(neighborhood.id, !neighborhood.active);
    if (!result.ok) setError(result.error ?? "Erro ao atualizar bairro");
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-bold">Gerenciar bairros</h3>
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
              placeholder="Nome do bairro"
              className="flex-1 rounded-xl border border-border px-3 py-2 text-sm"
            />
            <input
              type="text"
              inputMode="decimal"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="Taxa R$"
              className="w-24 rounded-xl border border-border px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreate}
              disabled={busy || !name.trim() || !fee.trim()}
              className="shrink-0 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
            >
              Adicionar
            </button>
          </div>

          <div className="divide-y divide-border rounded-xl border border-border">
            {neighborhoods.map((neighborhood) => (
              <div key={neighborhood.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
                <span className={`min-w-0 flex-1 truncate ${neighborhood.active ? "" : "text-muted-foreground line-through"}`}>
                  {neighborhood.name}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={feeEdits[neighborhood.id] ?? String(neighborhood.delivery_fee)}
                  onChange={(e) => setFeeEdits((prev) => ({ ...prev, [neighborhood.id]: e.target.value }))}
                  className="w-20 shrink-0 rounded-lg border border-border px-2 py-1 text-xs"
                />
                <button
                  onClick={() => handleSaveFee(neighborhood)}
                  disabled={busy || feeEdits[neighborhood.id] === undefined}
                  className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] font-bold hover:bg-muted disabled:opacity-40"
                >
                  OK
                </button>
                <button
                  onClick={() => handleToggle(neighborhood)}
                  disabled={busy}
                  className="shrink-0 rounded-full border border-border px-2 py-1 text-[11px] font-bold hover:bg-muted disabled:opacity-40"
                >
                  {neighborhood.active ? "Desativar" : "Reativar"}
                </button>
              </div>
            ))}
            {neighborhoods.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum bairro cadastrado</p>
            )}
          </div>

          {neighborhoods.length > 0 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Taxa atual: {neighborhoods.filter((n) => n.active).map((n) => `${n.name} ${currency(n.delivery_fee)}`).join(" · ")}
            </p>
          )}

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
