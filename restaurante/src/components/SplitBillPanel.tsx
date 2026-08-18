import { useState } from "react";
import { Plus, Undo2 } from "lucide-react";
import type { IncomingOrder, PaymentMethod, SplitPayment } from "../lib/orders";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: "Dinheiro", card: "Cartão", pix: "PIX" };

type Mode = "equal" | "by_item" | "manual";
const MODE_LABEL: [Mode, string][] = [
  ["equal", "Igualitária"],
  ["by_item", "Por item"],
  ["manual", "Valor livre"],
];

type MixedRow = { method: PaymentMethod; amount: string };
const DEFAULT_MIXED_ROWS: MixedRow[] = [
  { method: "cash", amount: "" },
  { method: "card", amount: "" },
];

// "implicit" = confirmar pagamento sem nenhuma divisão configurada ainda (o
// servidor cria um único split "Pagamento total" na hora). Qualquer outro
// valor é o id de um split já configurado.
type MixedTarget = "implicit" | string;

// Precisa ficar FORA de SplitBillPanel: um componente definido dentro do
// corpo de outro componente vira um tipo novo a cada render, e o React
// desmonta/remonta o subtree inteiro a cada re-render do pai — na prática,
// cada tecla digitada no valor perdia o foco e o caractere. Recebe tudo via
// props em vez de fechar sobre o estado do pai.
function MixedForm({
  rows,
  onRowsChange,
  diffCents,
  busy,
  onCancel,
  onSubmit,
}: {
  rows: MixedRow[];
  onRowsChange: (rows: MixedRow[]) => void;
  diffCents: number;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="mb-2 space-y-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-1.5">
            <select
              value={row.method}
              onChange={(e) => onRowsChange(rows.map((r, j) => (j === i ? { ...r, method: e.target.value as PaymentMethod } : r)))}
              className="rounded-lg border border-border px-2 py-1.5 text-sm"
            >
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABEL[m]}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={row.amount}
              onChange={(e) => onRowsChange(rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))}
              placeholder="0,00"
              className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => onRowsChange([...rows, { method: "pix", amount: "" }])}
        className="mb-2 flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar forma
      </button>
      <p className={`mb-2 text-xs font-bold ${diffCents === 0 ? "text-primary" : "text-destructive"}`}>
        {diffCents === 0
          ? "Soma bate com o valor"
          : diffCents > 0
            ? `Falta ${currency(diffCents / 100)}`
            : `Excedeu em ${currency(-diffCents / 100)}`}
      </p>
      <div className="flex gap-1.5">
        <button
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          onClick={onSubmit}
          disabled={busy || diffCents !== 0}
          className="flex-1 rounded-lg bg-primary px-2 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}

// Divisão de conta + confirmação de pagamento — vive só na aba Garçom
// (OrderDetailModal só renderiza este componente quando allowPaymentActions
// é true; em /pedidos ele mostra um bloco de leitura em vez disto). Toda
// mutação passa pela Edge Function staff-split-payment.
export function SplitBillPanel({
  order,
  onConfigureSplit,
  onMarkPaid,
  onVoidSplit,
}: {
  order: IncomingOrder;
  onConfigureSplit: (orderId: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  onMarkPaid: (orderId: string, splitId: string | null, payments: SplitPayment[]) => Promise<{ ok: boolean; error?: string }>;
  onVoidSplit: (orderId: string, splitId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [showSplitConfig, setShowSplitConfig] = useState(false);
  const [mode, setMode] = useState<Mode>("equal");
  const [busy, setBusy] = useState(false);
  // Qual split (ou "implicit") está com uma chamada em andamento — sem isso,
  // um clique num pagamento demorado (rede/edge function) fica sem nenhum
  // feedback visível além de botões desabilitados quase imperceptíveis, e
  // parece que o clique não fez nada.
  const [pendingTarget, setPendingTarget] = useState<MixedTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [parts, setParts] = useState("2");
  const [manualRows, setManualRows] = useState<{ label: string; amount: string }[]>([
    { label: "Parte 1", amount: "" },
    { label: "Parte 2", amount: "" },
  ]);
  const [people, setPeople] = useState<string[]>(["Pessoa 1", "Pessoa 2"]);
  const [itemPeople, setItemPeople] = useState<Record<string, Set<string>>>({});

  const [mixedFor, setMixedFor] = useState<MixedTarget | null>(null);
  const [mixedRows, setMixedRows] = useState<MixedRow[]>(DEFAULT_MIXED_ROWS);

  async function submitConfigure(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const result = await onConfigureSplit(order.id, payload);
    if (!result.ok) setError(result.error ?? "Erro ao configurar divisão");
    else setShowSplitConfig(false);
    setBusy(false);
  }

  function submitEqual() {
    const n = Number(parts);
    if (!Number.isInteger(n) || n < 1) {
      setError("Informe um número de pessoas válido");
      return;
    }
    submitConfigure({ mode: "equal", parts: n });
  }

  const manualSumCents = manualRows.reduce(
    (sum, r) => sum + Math.round((Number(r.amount.replace(",", ".")) || 0) * 100),
    0,
  );
  const manualDiffCents = Math.round(order.total * 100) - manualSumCents;

  function submitManual() {
    const splits = manualRows
      .filter((r) => r.label.trim())
      .map((r) => ({ label: r.label.trim(), amount: Number(r.amount.replace(",", ".")) || 0 }));
    submitConfigure({ mode: "manual", splits });
  }

  function toggleItemPerson(itemId: string, person: string) {
    setItemPeople((prev) => {
      const next = { ...prev };
      const current = new Set(next[itemId] ?? []);
      if (current.has(person)) current.delete(person);
      else current.add(person);
      next[itemId] = current;
      return next;
    });
  }

  const byItemReady = order.items.every((item) => (itemPeople[item.id]?.size ?? 0) > 0);

  function submitByItem() {
    const assignments = order.items.map((item) => ({
      order_item_id: item.id,
      shares: Array.from(itemPeople[item.id] ?? []).map((label) => ({ label, weight: 1 })),
    }));
    submitConfigure({ mode: "by_item", assignments });
  }

  function openMixed(target: MixedTarget) {
    setMixedFor(target);
    setMixedRows(DEFAULT_MIXED_ROWS);
    setError(null);
  }

  async function handleQuickPay(splitId: string | null, amount: number, method: PaymentMethod) {
    setBusy(true);
    setPendingTarget(splitId ?? "implicit");
    setError(null);
    const result = await onMarkPaid(order.id, splitId, [{ method, amount }]);
    if (!result.ok) setError(result.error ?? "Erro ao registrar pagamento");
    setBusy(false);
    setPendingTarget(null);
  }

  const mixedTargetAmount = mixedFor === "implicit" ? order.total : (order.payment_splits.find((s) => s.id === mixedFor)?.amount ?? 0);
  const mixedSumCents = mixedRows.reduce((sum, r) => sum + Math.round((Number(r.amount.replace(",", ".")) || 0) * 100), 0);
  const mixedDiffCents = Math.round(mixedTargetAmount * 100) - mixedSumCents;

  async function handleMixedSubmit(splitId: string | null) {
    const payments: SplitPayment[] = mixedRows
      .filter((r) => r.amount.trim())
      .map((r) => ({ method: r.method, amount: Number(r.amount.replace(",", ".")) || 0 }));
    setBusy(true);
    setPendingTarget(splitId ?? "implicit");
    setError(null);
    const result = await onMarkPaid(order.id, splitId, payments);
    if (!result.ok) setError(result.error ?? "Erro ao registrar pagamento");
    else setMixedFor(null);
    setBusy(false);
    setPendingTarget(null);
  }

  async function handleVoid(splitId: string) {
    setBusy(true);
    setPendingTarget(splitId);
    setError(null);
    const result = await onVoidSplit(order.id, splitId);
    if (!result.ok) setError(result.error ?? "Erro ao desfazer pagamento");
    setBusy(false);
    setPendingTarget(null);
  }

  if (order.payment_splits.length > 0) {
    const paidCount = order.payment_splits.filter((s) => s.status === "paid").length;
    const allPaid = paidCount === order.payment_splits.length;
    return (
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
          {order.payment_splits.length === 1
            ? allPaid
              ? "Pagamento · pago"
              : "Pagamento · pendente"
            : allPaid
              ? "Divisão da conta · totalmente paga"
              : `Divisão da conta · ${paidCount} de ${order.payment_splits.length} pagas`}
        </label>
        <div className="space-y-1.5">
          {order.payment_splits.map((split) => (
            <div key={split.id} className="rounded-lg border border-border px-2 py-1.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{split.label}</p>
                  <p className="text-xs text-muted-foreground">{currency(split.amount)}</p>
                </div>
                {pendingTarget === split.id ? (
                  <span className="text-[11px] font-bold text-muted-foreground">Processando…</span>
                ) : split.status === "paid" ? (
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                      {split.payments.length > 1 ? "Misto" : split.payment_method ? PAYMENT_LABEL[split.payment_method] : "Pago"}
                    </span>
                    <button
                      onClick={() => handleVoid(split.id)}
                      disabled={busy}
                      aria-label="Desfazer pagamento"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                ) : mixedFor !== split.id ? (
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-1">
                      {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((method) => (
                        <button
                          key={method}
                          onClick={() => handleQuickPay(split.id, split.amount, method)}
                          disabled={busy}
                          className="rounded-lg border border-border px-2 py-1 text-[11px] font-bold hover:bg-muted disabled:opacity-40"
                        >
                          {PAYMENT_LABEL[method]}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => openMixed(split.id)} className="text-[11px] font-bold text-muted-foreground hover:text-primary">
                      Pagamento misto
                    </button>
                  </div>
                ) : null}
              </div>
              {split.status === "paid" && split.payments.length > 1 && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {split.payments.map((p) => `${PAYMENT_LABEL[p.method]} ${currency(p.amount)}`).join(" + ")}
                </p>
              )}
              {split.status === "pending" && mixedFor === split.id && (
                <div className="mt-2">
                  <MixedForm
                    rows={mixedRows}
                    onRowsChange={setMixedRows}
                    diffCents={mixedDiffCents}
                    busy={busy}
                    onCancel={() => setMixedFor(null)}
                    onSubmit={() => handleMixedSubmit(split.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  // Único ponto de entrada quando ainda não há divisão configurada: um
  // toggle explícito "Pagamento único / Dividir conta" — não um link
  // pequeno — porque essa decisão precisa ser óbvia na etapa de fechamento.
  return (
    <div>
      <div className="mb-2 flex gap-1 rounded-full bg-muted p-1">
        <button
          onClick={() => setShowSplitConfig(false)}
          className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
            !showSplitConfig ? "bg-card shadow-card" : "text-muted-foreground"
          }`}
        >
          Pagamento único
        </button>
        <button
          onClick={() => setShowSplitConfig(true)}
          className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
            showSplitConfig ? "bg-card shadow-card" : "text-muted-foreground"
          }`}
        >
          Dividir conta
        </button>
      </div>

      {!showSplitConfig ? (
        pendingTarget === "implicit" ? (
          <p className="text-xs font-bold text-muted-foreground">Processando…</p>
        ) : mixedFor === "implicit" ? (
          <MixedForm
            rows={mixedRows}
            onRowsChange={setMixedRows}
            diffCents={mixedDiffCents}
            busy={busy}
            onCancel={() => setMixedFor(null)}
            onSubmit={() => handleMixedSubmit(null)}
          />
        ) : (
          <>
            <div className="mb-1.5 flex gap-1.5">
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  onClick={() => handleQuickPay(null, order.total, method)}
                  disabled={busy}
                  className="flex-1 rounded-lg border border-border px-2 py-1.5 text-xs font-bold hover:bg-muted disabled:opacity-40"
                >
                  {PAYMENT_LABEL[method]}
                </button>
              ))}
            </div>
            <button
              onClick={() => openMixed("implicit")}
              className="text-[11px] font-bold text-muted-foreground hover:text-primary"
            >
              Pagamento misto
            </button>
          </>
        )
      ) : (
        <div>
          <div className="mb-2 flex gap-1.5">
            {MODE_LABEL.map(([m, label]) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={`flex-1 rounded-full px-2 py-1.5 text-[11px] font-bold ${
                  mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "equal" && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Quantas pessoas?</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={parts}
                  onChange={(e) => setParts(e.target.value)}
                  className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                />
              </div>
              <button
                onClick={submitEqual}
                disabled={busy}
                className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
              >
                Gerar divisão
              </button>
            </div>
          )}

          {mode === "manual" && (
            <div>
              <div className="mb-2 space-y-1.5">
                {manualRows.map((row, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input
                      type="text"
                      value={row.label}
                      onChange={(e) => setManualRows((rows) => rows.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))}
                      placeholder="Rótulo"
                      className="w-24 rounded-lg border border-border px-2 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(e) => setManualRows((rows) => rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))}
                      placeholder="0,00"
                      className="flex-1 rounded-lg border border-border px-2 py-1.5 text-sm"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={() => setManualRows((rows) => [...rows, { label: `Parte ${rows.length + 1}`, amount: "" }])}
                className="mb-2 flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-primary"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar parte
              </button>
              <p className={`mb-2 text-xs font-bold ${manualDiffCents === 0 ? "text-primary" : "text-destructive"}`}>
                {manualDiffCents === 0
                  ? "Soma bate com o total"
                  : manualDiffCents > 0
                    ? `Falta ${currency(manualDiffCents / 100)}`
                    : `Excedeu em ${currency(-manualDiffCents / 100)}`}
              </p>
              <button
                onClick={submitManual}
                disabled={busy || manualDiffCents !== 0}
                className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
              >
                Confirmar divisão
              </button>
            </div>
          )}

          {mode === "by_item" && (
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {people.map((person) => (
                  <span key={person} className="rounded-full bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground">
                    {person}
                  </span>
                ))}
                <button
                  onClick={() => setPeople((p) => [...p, `Pessoa ${p.length + 1}`])}
                  className="flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-[11px] font-bold text-muted-foreground hover:border-primary hover:text-primary"
                >
                  <Plus className="h-3 w-3" aria-hidden /> Pessoa
                </button>
              </div>
              <div className="mb-2 max-h-48 space-y-2 overflow-y-auto">
                {order.items.map((item) => (
                  <div key={item.id} className="rounded-lg border border-border p-2">
                    <p className="mb-1 text-xs font-bold">
                      {item.quantity}x {item.product_name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {people.map((person) => {
                        const selected = itemPeople[item.id]?.has(person) ?? false;
                        return (
                          <button
                            key={person}
                            onClick={() => toggleItemPerson(item.id, person)}
                            className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                              selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {person}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={submitByItem}
                disabled={busy || !byItemReady}
                className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground disabled:opacity-40"
              >
                Gerar divisão
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
