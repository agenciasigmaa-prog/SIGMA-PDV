import { useEffect, useMemo, useState } from "react";
import { MapPin, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import { itemTotal, orderLocationLabel, type IncomingOrder, type PaymentMethod } from "../lib/orders";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PAYMENT_LABEL: Record<PaymentMethod, string> = { cash: "Dinheiro", card: "Cartão", pix: "PIX" };

type PickerProduct = { id: string; name: string; price: number; category_id: string | null };
type PickerCategory = { id: string; name: string };

// Edição de pedido já lançado — adicionar/remover item, observações e
// financeiro (desconto/taxa de serviço/pagamento). Adição/remoção de item e
// desconto/taxa passam pela Edge Function staff-edit-order, que recalcula
// subtotal/total sempre a partir do banco (nunca confia em valor do client).
// Registrar pagamento é a única mutação que não recalcula preço, por isso
// vai direto pelo update (mesma policy orders_staff_update do avançar status).
export function OrderDetailModal({
  order,
  restaurantId,
  onClose,
  onRegisterPayment,
}: {
  order: IncomingOrder;
  restaurantId: string;
  onClose: () => void;
  onRegisterPayment: (orderId: string, method: PaymentMethod) => Promise<void>;
}) {
  const [categories, setCategories] = useState<PickerCategory[]>([]);
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [showPicker, setShowPicker] = useState(false);
  const [notes, setNotes] = useState(order.notes ?? "");
  const [discountInput, setDiscountInput] = useState(String(order.discount_amount));
  const [serviceChargeInput, setServiceChargeInput] = useState(String(order.service_charge_amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setNotes(order.notes ?? "");
  }, [order.notes]);

  useEffect(() => {
    setDiscountInput(String(order.discount_amount));
  }, [order.discount_amount]);

  useEffect(() => {
    setServiceChargeInput(String(order.service_charge_amount));
  }, [order.service_charge_amount]);

  useEffect(() => {
    if (!showPicker) return;
    supabase
      .from("categories")
      .select("id, name")
      .eq("restaurant_id", restaurantId)
      .order("sort_order")
      .then(({ data }) => setCategories(data ?? []));
    supabase
      .from("products")
      .select("id, name, price, category_id")
      .eq("restaurant_id", restaurantId)
      .eq("active", true)
      .eq("sold_out", false)
      .order("sort_order")
      .then(({ data }) => setProducts((data ?? []).map((p) => ({ ...p, price: Number(p.price) }))));
  }, [showPicker, restaurantId]);

  const visibleProducts = useMemo(
    () => (activeCategory === "all" ? products : products.filter((p) => p.category_id === activeCategory)),
    [products, activeCategory],
  );

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

  async function handleAddProduct(product: PickerProduct) {
    const ok = await callEdit({ action: "add_item", product_id: product.id, quantity: 1 });
    if (ok) setShowPicker(false);
  }

  async function handleRemoveItem(orderItemId: string) {
    await callEdit({ action: "remove_item", order_item_id: orderItemId });
  }

  async function handleSaveNotes() {
    await callEdit({ action: "set_notes", notes });
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

  async function handleRegisterPayment(method: PaymentMethod) {
    setBusy(true);
    await onRegisterPayment(order.id, method);
    setBusy(false);
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
            {order.order_type === "delivery" && order.delivery_address && (
              <p className="mt-1 flex items-start gap-1 text-xs font-medium text-foreground">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> {order.delivery_address.text}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 divide-y divide-border rounded-xl border border-border">
            {order.items.map((item) => (
              <div key={item.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold">
                      {item.quantity}x {item.product_name}
                      {item.half_flavor_name && <span className="text-muted-foreground"> / {item.half_flavor_name}</span>}
                    </span>
                    {item.notes && <p className="mt-0.5 text-xs text-muted-foreground">Obs: {item.notes}</p>}
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
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-bold">{currency(itemTotal(item))}</span>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={busy}
                      aria-label="Remover item"
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!showPicker ? (
            <button
              onClick={() => setShowPicker(true)}
              className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar item
            </button>
          ) : (
            <div className="mb-4">
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                <button
                  onClick={() => setActiveCategory("all")}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                    activeCategory === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  Todos
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCategory(c.id)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${
                      activeCategory === c.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {visibleProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleAddProduct(product)}
                    disabled={busy}
                    className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-40"
                  >
                    <span>{product.name}</span>
                    <span className="font-bold">{currency(product.price)}</span>
                  </button>
                ))}
                {visibleProducts.length === 0 && (
                  <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum produto disponível</p>
                )}
              </div>
            </div>
          )}

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

            <div className="mb-2 flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Desconto (R$)</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={discountInput}
                    onChange={(e) => setDiscountInput(e.target.value)}
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={handleSaveDiscount}
                    disabled={busy}
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
                    className="w-full rounded-lg border border-border px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => setServiceChargeInput((Math.round(order.subtotal * 10) / 100).toFixed(2))}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-border px-2 text-xs font-bold hover:bg-muted disabled:opacity-40"
                  >
                    10%
                  </button>
                  <button
                    onClick={handleSaveServiceCharge}
                    disabled={busy}
                    className="shrink-0 rounded-lg border border-border px-2 text-xs font-bold hover:bg-muted disabled:opacity-40"
                  >
                    OK
                  </button>
                </div>
              </div>
            </div>

            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              Pagamento {order.payment_status === "paid" ? "· pago" : "· pendente"}
            </label>
            <div className="flex gap-1.5">
              {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((method) => (
                <button
                  key={method}
                  onClick={() => handleRegisterPayment(method)}
                  disabled={busy}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-bold disabled:opacity-40 ${
                    order.payment_method === method
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {PAYMENT_LABEL[method]}
                </button>
              ))}
            </div>
          </div>

          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Observação do pedido</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: cliente vai buscar mais tarde"
            rows={2}
            className="mb-2 w-full rounded-xl border border-border px-3 py-2.5 text-sm"
          />
          <button
            onClick={handleSaveNotes}
            disabled={busy || notes === (order.notes ?? "")}
            className="w-full rounded-full border border-border px-4 py-2 text-xs font-bold hover:bg-muted disabled:opacity-40"
          >
            Salvar observação
          </button>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
