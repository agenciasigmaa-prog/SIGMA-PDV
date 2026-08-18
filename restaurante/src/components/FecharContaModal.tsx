import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import { itemTotal, orderLocationLabel, type IncomingOrder, type SplitPayment } from "../lib/orders";
import { SplitBillPanel } from "./SplitBillPanel";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Etapa 2 do atendimento: fechar a conta. Fica num modal separado do detalhe
// do pedido (Etapa 1) de propósito — revisão final (itens consumidos,
// desconto/taxa) e pagamento/divisão só aparecem aqui, na hora de fechar, não
// durante o atendimento normal. Menos coisa na tela em cada momento, menos
// chance de mexer em desconto/pagamento sem querer enquanto só se quer
// lançar mais um item.
export function FecharContaModal({
  order,
  onClose,
  onConfigureSplit,
  onMarkPaid,
  onVoidSplit,
}: {
  order: IncomingOrder;
  onClose: () => void;
  onConfigureSplit: (orderId: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  onMarkPaid: (orderId: string, splitId: string | null, payments: SplitPayment[]) => Promise<{ ok: boolean; error?: string }>;
  onVoidSplit: (orderId: string, splitId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [discountInput, setDiscountInput] = useState(String(order.discount_amount));
  const [serviceChargeInput, setServiceChargeInput] = useState(String(order.service_charge_amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Itens ficam travados aqui — editar item é coisa da Etapa 1 (detalhe do
  // pedido); nesta etapa os itens já são dados, só se revisa o que vai pra
  // conta.
  const hasPaidSplit = order.payment_splits.some((s) => s.status === "paid");

  useEffect(() => {
    setDiscountInput(String(order.discount_amount));
  }, [order.discount_amount]);

  useEffect(() => {
    setServiceChargeInput(String(order.service_charge_amount));
  }, [order.service_charge_amount]);

  async function callEdit(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const { error: fnError } = await supabase.functions.invoke("staff-edit-order", {
      body: { order_id: order.id, ...body },
    });
    if (fnError) setError(await describeFunctionError(fnError));
    setBusy(false);
    return !fnError;
  }

  async function handleSaveDiscount() {
    const value = Number(discountInput.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return;
    await callEdit({ action: "set_discount", discount_amount: value });
  }

  async function handleSaveServiceCharge() {
    const value = Number(serviceChargeInput.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) return;
    await callEdit({ action: "set_service_charge", service_charge_amount: value });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <div>
            <h3 className="text-lg font-bold">Fechar conta</h3>
            <p className="text-xs text-muted-foreground">
              {order.customer_name} · {orderLocationLabel(order)}
            </p>
          </div>
          <button onClick={onClose} aria-label="Voltar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Consumido</label>
          <div className="mb-4 divide-y divide-border rounded-xl border border-border">
            {order.items.map((item) => (
              <div key={item.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold">
                      {item.quantity}x {item.product_name}
                      {item.half_flavor_name && <span className="text-muted-foreground"> / {item.half_flavor_name}</span>}
                    </span>
                    {item.addons.map((addon, i) => (
                      <p key={`addon-${i}`} className="text-xs text-muted-foreground">
                        + {addon.quantity}x {addon.name}
                      </p>
                    ))}
                    {item.combo_choices.map((c, i) => (
                      <p key={`choice-${i}`} className="text-xs text-muted-foreground">
                        {c.group_name}: {c.option_name}
                      </p>
                    ))}
                    {item.removed_ingredients.map((n, i) => (
                      <p key={`removed-${i}`} className="text-xs text-destructive">
                        Sem {n}
                      </p>
                    ))}
                  </div>
                  <span className="shrink-0 font-bold">{currency(itemTotal(item))}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mb-4 rounded-xl border border-border p-3">
            <div className="mb-2 space-y-1 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{currency(order.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Desconto</span>
                <span>-{currency(order.discount_amount)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Taxa de serviço</span>
                <span>+{currency(order.service_charge_amount)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1 font-bold">
                <span>Total</span>
                <span>{currency(order.total)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Desconto (R$)</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    disabled={hasPaidSplit}
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-sm disabled:opacity-40"
                  />
                  <button
                    onClick={handleSaveDiscount}
                    disabled={busy || hasPaidSplit}
                    className="shrink-0 rounded-lg border border-border px-2 text-xs font-bold hover:bg-muted disabled:opacity-40"
                  >
                    OK
                  </button>
                </div>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Taxa de serviço (R$)</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={serviceChargeInput}
                    onChange={(e) => setServiceChargeInput(e.target.value)}
                    disabled={hasPaidSplit}
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-sm disabled:opacity-40"
                  />
                  <button
                    onClick={() => setServiceChargeInput((Math.round(order.subtotal * 10) / 100).toFixed(2))}
                    disabled={busy || hasPaidSplit}
                    className="shrink-0 rounded-lg border border-border px-2 text-xs font-bold hover:bg-muted disabled:opacity-40"
                  >
                    10%
                  </button>
                  <button
                    onClick={handleSaveServiceCharge}
                    disabled={busy || hasPaidSplit}
                    className="shrink-0 rounded-lg border border-border px-2 text-xs font-bold hover:bg-muted disabled:opacity-40"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>
          </div>

          <SplitBillPanel order={order} onConfigureSplit={onConfigureSplit} onMarkPaid={onMarkPaid} onVoidSplit={onVoidSplit} />

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
