import { useState } from "react";
import { X } from "lucide-react";
import { CurrencyInput } from "./CurrencyInput";
import { DEMAND_REASON_LABEL, type DemandAdjustment, type DemandReason } from "../lib/demandAdjustment";
import type { Neighborhood } from "../lib/neighborhoods";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const REASONS: DemandReason[] = ["motoboy_faltou", "chuva", "cozinheiro_faltou", "alta_demanda", "outro"];

const DURATION_OPTIONS = [
  { label: "1 hora", minutes: 60 },
  { label: "2 horas", minutes: 120 },
  { label: "4 horas", minutes: 240 },
  { label: "6 horas", minutes: 360 },
];

// Modal "Ajustar tempo e taxa de entrega" — inspirado no Gestor de Pedidos
// do iFood. Só ajusta minutos/taxa extra (soma em cima do que já existe por
// bairro, não substitui) e expira sozinho; não mexe em tempo base por
// bairro (não existe no sistema hoje) nem avisa o cliente no checkout
// (decisão deliberada por agora — ver CLAUDE.md).
export function AltaDemandaModal({
  active,
  neighborhoods,
  onSave,
  onClear,
  onClose,
}: {
  active: DemandAdjustment | null;
  neighborhoods: Neighborhood[];
  onSave: (input: {
    extraMinutes: number;
    extraFee: number;
    reason: DemandReason;
    reasonOther: string | null;
    durationMinutes: number;
  }) => Promise<{ ok: boolean; error?: string }>;
  onClear: () => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
}) {
  const [extraMinutes, setExtraMinutes] = useState(String(active?.extraMinutes ?? ""));
  const [extraFee, setExtraFee] = useState<number | null>(active?.extraFee || null);
  const [reason, setReason] = useState<DemandReason | null>(active?.reason ?? null);
  const [reasonOther, setReasonOther] = useState(active?.reasonOther ?? "");
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutesValue = Math.max(0, Number(extraMinutes.replace(",", ".")) || 0);
  const feeValue = extraFee ?? 0;
  const hasAdjustment = minutesValue > 0 || feeValue > 0;
  const reasonOtherOk = reason !== "outro" || reasonOther.trim().length > 0;
  const canSave = hasAdjustment && reason !== null && reasonOtherOk && !busy;

  async function handleSave() {
    if (!canSave || !reason) return;
    setBusy(true);
    setError(null);
    const result = await onSave({
      extraMinutes: minutesValue,
      extraFee: feeValue,
      reason,
      reasonOther: reason === "outro" ? reasonOther : null,
      durationMinutes,
    });
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Erro ao salvar ajuste");
    else onClose();
  }

  async function handleClear() {
    setBusy(true);
    setError(null);
    const result = await onClear();
    setBusy(false);
    if (!result.ok) setError(result.error ?? "Erro ao remover ajuste");
    else onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-bold">Ajustar tempo e taxa de entrega</h3>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {active && (
            <p className="rounded-xl bg-accent/20 px-3 py-2 text-xs font-medium text-foreground">
              Ajuste ativo até {new Date(active.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              {active.reason ? ` — ${active.reason === "outro" ? active.reasonOther : DEMAND_REASON_LABEL[active.reason]}` : ""}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-bold text-muted-foreground">
              Tempo extra
              <input
                type="text"
                inputMode="numeric"
                value={extraMinutes}
                onChange={(e) => setExtraMinutes(e.target.value.replace(/\D/g, ""))}
                placeholder="0"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm font-normal text-foreground"
              />
              <span className="block text-[10px] font-normal normal-case text-muted-foreground">minutos</span>
            </label>
            <label className="space-y-1 text-xs font-bold text-muted-foreground">
              Taxa extra
              <CurrencyInput
                value={extraFee}
                onChange={setExtraFee}
                className="w-full rounded-xl border border-border px-3 py-2 text-sm font-normal text-foreground"
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-bold text-muted-foreground">Motivo (ajuda a informar seus clientes)</p>
            <div className="space-y-1.5">
              {REASONS.map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="demand-reason" checked={reason === value} onChange={() => setReason(value)} />
                  {DEMAND_REASON_LABEL[value]}
                </label>
              ))}
            </div>
            {reason === "outro" && (
              <input
                type="text"
                value={reasonOther}
                onChange={(e) => setReasonOther(e.target.value)}
                placeholder="Digite o motivo"
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
              />
            )}
          </div>

          <label className="block space-y-1 text-xs font-bold text-muted-foreground">
            Duração do ajuste
            <select
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm font-normal text-foreground"
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.minutes} value={opt.minutes}>
                  Expira em {opt.label}
                </option>
              ))}
            </select>
          </label>

          {neighborhoods.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground">Regiões de entrega (taxa base)</p>
              <div className="divide-y divide-border rounded-xl border border-border text-sm">
                {neighborhoods
                  .filter((n) => n.active)
                  .map((n) => (
                    <div key={n.id} className="flex items-center justify-between px-3 py-2">
                      <span className="truncate">{n.name}</span>
                      <span className="shrink-0 text-muted-foreground">{currency(n.delivery_fee)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          {active ? (
            <button
              onClick={handleClear}
              disabled={busy}
              className="press rounded-full border border-border px-4 py-2 text-sm font-bold text-destructive hover:bg-destructive/10 disabled:opacity-40"
            >
              Remover ajuste
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="press rounded-full border border-border px-4 py-2 text-sm font-bold hover:bg-muted">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="press rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              Atualizar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
