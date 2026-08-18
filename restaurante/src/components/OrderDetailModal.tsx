import { useEffect, useMemo, useState } from "react";
import { MapPin, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import { useAddonGroups } from "../lib/addons";
import type { HalfAndHalfPricingMode } from "../lib/halfAndHalfPricing";
import { itemTotal, orderLocationLabel, type IncomingOrder, type SplitPayment } from "../lib/orders";
import { useRemovableIngredients } from "../lib/removableIngredients";
import type { Waiter } from "../lib/waiters";
import type { DeliveryDriver } from "../lib/deliveryDrivers";
import { DeliveryDriverAssignSelect } from "./DeliveryDriverAssignSelect";
import { FecharContaModal } from "./FecharContaModal";
import { ItemCustomizeModal } from "./ItemCustomizeModal";
import { WaiterAssignSelect } from "./WaiterAssignSelect";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type PickerProduct = { id: string; name: string; price: number; category_id: string | null };
type PickerCategory = {
  id: string;
  name: string;
  allow_half_and_half: boolean;
  half_and_half_pricing: HalfAndHalfPricingMode;
};

// Etapa 1 do atendimento: pedido em andamento — status, itens, adicionais e
// observação. Desconto, taxa de serviço, divisão de conta e pagamento vivem
// só no fluxo de fechamento (FecharContaModal, aberto pelo botão "Fechar
// conta" abaixo) — de propósito, pra essa tela não acumular tudo de uma vez.
// Adição/remoção de item passa pela Edge Function staff-edit-order, que
// recalcula subtotal/total sempre a partir do banco. Aberto tanto de
// /pedidos (balcão pode fechar a conta direto) quanto da aba Garçom.
export function OrderDetailModal({
  order,
  restaurantId,
  onClose,
  onConfigureSplit,
  onMarkSplitPaid,
  onVoidSplit,
  waiters,
  onAssignWaiter,
  drivers,
  onAssignDeliveryDriver,
}: {
  order: IncomingOrder;
  restaurantId: string;
  onClose: () => void;
  onConfigureSplit: (orderId: string, payload: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
  onMarkSplitPaid: (orderId: string, splitId: string | null, payments: SplitPayment[]) => Promise<{ ok: boolean; error?: string }>;
  onVoidSplit: (orderId: string, splitId: string) => Promise<{ ok: boolean; error?: string }>;
  waiters: Waiter[];
  onAssignWaiter: (orderId: string, waiterId: string) => Promise<{ ok: boolean; error?: string }>;
  drivers?: DeliveryDriver[];
  onAssignDeliveryDriver?: (orderId: string, driverId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [categories, setCategories] = useState<PickerCategory[]>([]);
  const [products, setProducts] = useState<PickerProduct[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [showPicker, setShowPicker] = useState(false);
  const [showFecharConta, setShowFecharConta] = useState(false);
  const [pendingAddonProduct, setPendingAddonProduct] = useState<PickerProduct | null>(null);
  const [notes, setNotes] = useState(order.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { groupsForCategory } = useAddonGroups(restaurantId);
  const { forProduct: removableIngredientsForProduct } = useRemovableIngredients(restaurantId);

  // Editar item muda o total, o que quebraria uma divisão de conta com parte
  // já paga — o servidor (staff-edit-order) já bloqueia isso, aqui é só o
  // espelho visual pra não deixar o garçom tentar uma ação que vai ser
  // rejeitada.
  const hasPaidSplit = order.payment_splits.some((s) => s.status === "paid");

  useEffect(() => {
    setNotes(order.notes ?? "");
  }, [order.notes]);

  useEffect(() => {
    if (!showPicker) return;
    supabase
      .from("categories")
      .select("id, name, allow_half_and_half, half_and_half_pricing")
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

  // Categoria com meio a meio habilitado (hoje só Pizza) — opções são os
  // outros produtos da MESMA categoria, preço final sempre recalculado no
  // servidor a partir do modo (maior valor/média) da categoria.
  function halfAndHalfFor(product: PickerProduct) {
    const category = categories.find((c) => c.id === product.category_id);
    if (!category?.allow_half_and_half) return undefined;
    const options = products.filter((p) => p.category_id === product.category_id && p.id !== product.id);
    if (options.length === 0) return undefined;
    return { pricingMode: category.half_and_half_pricing, options };
  }

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

  function handleAddProduct(product: PickerProduct) {
    // Sempre abre o personalizador — mesmo produto sem adicional/ingrediente
    // removível cadastrado ainda ganha o campo de observação livre. Antes só
    // dava pra "adicionar o produto" puro nesse caminho, sem jeito nenhum de
    // anotar algo na comanda.
    setPendingAddonProduct(product);
  }

  async function handleConfirmAddons(customization: {
    addons: { addon_id: string; quantity: number }[];
    removedIngredientIds: string[];
    notes: string;
    halfFlavorProductId: string | null;
  }) {
    if (!pendingAddonProduct) return;
    const ok = await callEdit({
      action: "add_item",
      product_id: pendingAddonProduct.id,
      quantity: 1,
      addons: customization.addons,
      removed_ingredient_ids: customization.removedIngredientIds,
      ...(customization.notes ? { notes: customization.notes } : {}),
      ...(customization.halfFlavorProductId ? { half_flavor_product_id: customization.halfFlavorProductId } : {}),
    });
    if (ok) {
      setPendingAddonProduct(null);
      setShowPicker(false);
    }
  }

  async function handleRemoveItem(orderItemId: string) {
    await callEdit({ action: "remove_item", order_item_id: orderItemId });
  }

  async function handleSaveNotes() {
    await callEdit({ action: "set_notes", notes });
  }

  return (
    <>
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
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                {order.delivery_address.text}
                {order.neighborhood_name && ` — ${order.neighborhood_name}`}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <WaiterAssignSelect
                waiters={waiters}
                waiterId={order.waiter_id}
                onAssign={(waiterId) => onAssignWaiter(order.id, waiterId)}
              />
              {order.order_type === "delivery" && drivers && onAssignDeliveryDriver && (
                <DeliveryDriverAssignSelect
                  drivers={drivers}
                  driverId={order.delivery_driver_id}
                  onAssign={(driverId) => onAssignDeliveryDriver(order.id, driverId)}
                />
              )}
            </div>
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
                      disabled={busy || hasPaidSplit}
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

          {hasPaidSplit && (
            <p className="mb-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              Pedido tem partes da conta já pagas — desfaça o pagamento pra editar itens, desconto ou taxa de serviço.
            </p>
          )}

          {!showPicker ? (
            <button
              onClick={() => setShowPicker(true)}
              disabled={hasPaidSplit}
              className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-40"
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
            <div className="mb-2 flex items-center justify-between text-sm font-bold">
              <span>Total</span>
              <span>{currency(order.total)}</span>
            </div>
            {order.payment_status === "paid" ? (
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                  Conta fechada · Pago
                </span>
                <button
                  onClick={() => setShowFecharConta(true)}
                  className="text-xs font-bold text-muted-foreground hover:text-primary"
                >
                  Ver pagamento
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowFecharConta(true)}
                className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105"
              >
                Fechar conta
              </button>
            )}
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

    {showFecharConta && (
      <FecharContaModal
        order={order}
        onClose={() => setShowFecharConta(false)}
        onConfigureSplit={onConfigureSplit}
        onMarkPaid={onMarkSplitPaid}
        onVoidSplit={onVoidSplit}
      />
    )}

    {pendingAddonProduct && (
      <ItemCustomizeModal
        productName={pendingAddonProduct.name}
        productPrice={pendingAddonProduct.price}
        groups={groupsForCategory(pendingAddonProduct.category_id)}
        removableIngredients={removableIngredientsForProduct(pendingAddonProduct.id)}
        halfAndHalf={halfAndHalfFor(pendingAddonProduct)}
        onClose={() => setPendingAddonProduct(null)}
        onConfirm={handleConfirmAddons}
      />
    )}
    </>
  );
}
