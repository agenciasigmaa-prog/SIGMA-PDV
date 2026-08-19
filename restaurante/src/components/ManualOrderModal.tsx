import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Search, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import { useAddonGroups } from "../lib/addons";
import { useDeliveryDrivers } from "../lib/deliveryDrivers";
import { computeHalfAndHalfPrice, type HalfAndHalfPricingMode } from "../lib/halfAndHalfPricing";
import { useNeighborhoods } from "../lib/neighborhoods";
import { useRemovableIngredients } from "../lib/removableIngredients";
import { useWaiters } from "../lib/waiters";
import { ItemCustomizeModal } from "./ItemCustomizeModal";

const currency = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ManualProduct = { id: string; name: string; price: number; category_id: string | null };
type ManualCategory = {
  id: string;
  name: string;
  allow_half_and_half: boolean;
  half_and_half_pricing: HalfAndHalfPricingMode;
};
type CartAddon = { addon_id: string; name: string; price: number; quantity: number };
type CartLine = {
  key: string;
  product_id: string;
  name: string;
  price: number;
  quantity: number;
  addons: CartAddon[];
  removedIngredients: { ingredientId: string; name: string }[];
  notes: string;
  halfFlavorProductId: string | null;
  halfFlavorName: string | null;
};

// Pedido lançado pelo staff (telefone, balcão, esqueceu de escanear o QR
// etc.) — combo (escolha dentro do combo) continua fora, mas adicionais,
// meio a meio, remover ingrediente e observação por item são suportados
// (mesma seleção do cardápio do cliente).
export function ManualOrderModal({
  restaurantId,
  onClose,
  onCreated,
}: {
  restaurantId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [categories, setCategories] = useState<ManualCategory[]>([]);
  const [products, setProducts] = useState<ManualProduct[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orderType, setOrderType] = useState<"dine_in" | "pickup" | "delivery">("dine_in");
  const [customerName, setCustomerName] = useState("");
  const [tableLabel, setTableLabel] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [waiterId, setWaiterId] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [deliveryDriverId, setDeliveryDriverId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"" | "cash" | "card" | "pix">("");
  const [changeFor, setChangeFor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdPickupCode, setCreatedPickupCode] = useState<string | null>(null);
  const [pendingAddonProduct, setPendingAddonProduct] = useState<ManualProduct | null>(null);

  const { waiters } = useWaiters(restaurantId);
  const activeWaiters = waiters.filter((w) => w.active);
  const { drivers } = useDeliveryDrivers(restaurantId);
  const activeDrivers = drivers.filter((d) => d.active);
  const { neighborhoods } = useNeighborhoods(restaurantId);
  const activeNeighborhoods = neighborhoods.filter((n) => n.active);
  const selectedNeighborhood = neighborhoods.find((n) => n.id === neighborhoodId) ?? null;
  const { groupsForCategory } = useAddonGroups(restaurantId);
  const { forProduct: removableIngredientsForProduct } = useRemovableIngredients(restaurantId);

  useEffect(() => {
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
  }, [restaurantId]);

  const visibleProducts = useMemo(() => {
    let list = activeCategory === "all" ? products : products.filter((p) => p.category_id === activeCategory);
    const query = search.trim().toLowerCase();
    if (query) list = list.filter((p) => p.name.toLowerCase().includes(query));
    return list;
  }, [products, activeCategory, search]);

  const lineUnitPrice = (line: CartLine) => line.price + line.addons.reduce((s, a) => s + a.price * a.quantity, 0);
  const itemsSubtotal = useMemo(() => cart.reduce((sum, line) => sum + lineUnitPrice(line) * line.quantity, 0), [cart]);
  const deliveryFee = orderType === "delivery" ? (selectedNeighborhood?.delivery_fee ?? 0) : 0;
  const total = itemsSubtotal + deliveryFee;

  // Categoria com meio a meio habilitado (hoje só Pizza) — opções são os
  // outros produtos da MESMA categoria, preço final sempre recalculado no
  // servidor a partir do modo (maior valor/média) da categoria.
  function halfAndHalfFor(product: ManualProduct) {
    const category = categories.find((c) => c.id === product.category_id);
    if (!category?.allow_half_and_half) return undefined;
    const options = products.filter((p) => p.category_id === product.category_id && p.id !== product.id);
    if (options.length === 0) return undefined;
    return { pricingMode: category.half_and_half_pricing, options };
  }

  function addProduct(product: ManualProduct) {
    // Sempre abre o personalizador — mesmo produto sem adicional/ingrediente
    // removível cadastrado ainda ganha o campo de observação livre.
    setPendingAddonProduct(product);
  }

  function handleConfirmAddons(customization: {
    addons: CartAddon[];
    removedIngredientIds: string[];
    notes: string;
    halfFlavorProductId: string | null;
  }) {
    if (!pendingAddonProduct) return;
    const removedIngredients = removableIngredientsForProduct(pendingAddonProduct.id).filter((i) =>
      customization.removedIngredientIds.includes(i.ingredientId),
    );
    const halfFlavor = customization.halfFlavorProductId
      ? products.find((p) => p.id === customization.halfFlavorProductId)
      : null;
    const category = categories.find((c) => c.id === pendingAddonProduct.category_id);
    const price = halfFlavor
      ? computeHalfAndHalfPrice(pendingAddonProduct.price, halfFlavor.price, category!.half_and_half_pricing)
      : pendingAddonProduct.price;
    setCart((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        product_id: pendingAddonProduct.id,
        name: pendingAddonProduct.name,
        price,
        quantity: 1,
        addons: customization.addons,
        removedIngredients,
        notes: customization.notes,
        halfFlavorProductId: halfFlavor?.id ?? null,
        halfFlavorName: halfFlavor?.name ?? null,
      },
    ]);
    setPendingAddonProduct(null);
  }

  function changeQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity: l.quantity + delta } : l)).filter((l) => l.quantity > 0),
    );
  }

  // Mesma regra do servidor (place-dine-in-order): troco só existe em
  // dinheiro e nunca pode ser menor que o total, senão não sobra troco
  // nenhum pra dar — validado aqui também só pra dar feedback imediato,
  // a validação de verdade continua no servidor.
  const changeForValue = paymentMethod === "cash" && changeFor.trim() !== "" ? Number(changeFor) : null;
  const changeForInvalid = changeForValue != null && changeForValue < total;

  async function handleSubmit() {
    if (cart.length === 0 || !customerName.trim() || submitting) return;
    if (orderType === "dine_in" && !tableLabel.trim()) return;
    if (orderType === "delivery" && (!deliveryAddress.trim() || !neighborhoodId)) return;
    if (changeForInvalid) return;
    setSubmitting(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("place-dine-in-order", {
      body: {
        restaurant_id: restaurantId,
        customer_name: customerName.trim(),
        order_type: orderType,
        ...(orderType === "dine_in" ? { table_label: tableLabel.trim() } : {}),
        ...(orderType === "delivery" ? { delivery_address: deliveryAddress.trim(), neighborhood_id: neighborhoodId } : {}),
        ...(waiterId ? { waiter_id: waiterId } : {}),
        ...(orderType === "delivery" && deliveryDriverId ? { delivery_driver_id: deliveryDriverId } : {}),
        ...(orderType === "delivery" && paymentMethod ? { payment_method: paymentMethod } : {}),
        ...(orderType === "delivery" && changeForValue != null ? { change_for: changeForValue } : {}),
        items: cart.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          ...(l.addons.length > 0 ? { addons: l.addons.map((a) => ({ addon_id: a.addon_id, quantity: a.quantity })) } : {}),
          ...(l.removedIngredients.length > 0
            ? { removed_ingredient_ids: l.removedIngredients.map((i) => i.ingredientId) }
            : {}),
          ...(l.notes ? { notes: l.notes } : {}),
          ...(l.halfFlavorProductId ? { half_flavor_product_id: l.halfFlavorProductId } : {}),
        })),
      },
    });
    if (fnError) {
      setError(await describeFunctionError(fnError));
      setSubmitting(false);
      return;
    }
    setSubmitting(false);
    if (orderType === "pickup" && data?.pickup_code) {
      setCreatedPickupCode(data.pickup_code);
      return;
    }
    onCreated();
  }

  if (createdPickupCode) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center shadow-elevated">
          <p className="mb-2 text-sm text-muted-foreground">Código de retirada</p>
          <p className="mb-6 text-5xl font-bold tabular-nums">{createdPickupCode}</p>
          <button
            onClick={onCreated}
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border p-4">
          <h3 className="text-lg font-bold">Novo pedido manual</h3>
          <button onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto"
              className="w-full rounded-xl border border-border py-2.5 pl-9 pr-3 text-sm"
            />
          </div>

          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
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

          <div className="mb-4 divide-y divide-border rounded-xl border border-border">
            {visibleProducts.map((product) => (
              <button
                key={product.id}
                onClick={() => addProduct(product)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-muted"
              >
                <span>{product.name}</span>
                <span className="font-bold">{currency(product.price)}</span>
              </button>
            ))}
            {visibleProducts.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">Nenhum produto disponível</p>
            )}
          </div>

          {cart.length > 0 && (
            <div className="mb-4 divide-y divide-border rounded-xl border border-border">
              {cart.map((line) => (
                <div key={line.key} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">
                      {line.name}
                      {line.halfFlavorName && <span className="text-muted-foreground"> / {line.halfFlavorName}</span>}
                    </span>
                    {line.addons.map((addon, i) => (
                      <span key={`addon-${i}`} className="block text-xs text-muted-foreground">
                        + {addon.quantity}x {addon.name}
                      </span>
                    ))}
                    {line.removedIngredients.map((ingredient, i) => (
                      <span key={`removed-${i}`} className="block text-xs text-destructive">
                        Sem {ingredient.name}
                      </span>
                    ))}
                    {line.notes && <span className="block text-xs italic text-muted-foreground">Obs: {line.notes}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => changeQuantity(line.key, -1)}
                      aria-label="Diminuir quantidade"
                      className="rounded-full border border-border p-1 hover:bg-muted"
                    >
                      <Minus className="h-3 w-3" aria-hidden />
                    </button>
                    <span className="w-4 text-center font-bold">{line.quantity}</span>
                    <button
                      onClick={() => changeQuantity(line.key, 1)}
                      aria-label="Aumentar quantidade"
                      className="rounded-full border border-border p-1 hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                  <span className="w-20 shrink-0 text-right font-bold">{currency(lineUnitPrice(line) * line.quantity)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mb-2 flex gap-1 rounded-full bg-muted p-1">
            <button
              onClick={() => setOrderType("dine_in")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                orderType === "dine_in" ? "bg-card shadow-card" : "text-muted-foreground"
              }`}
            >
              Mesa
            </button>
            <button
              onClick={() => setOrderType("pickup")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                orderType === "pickup" ? "bg-card shadow-card" : "text-muted-foreground"
              }`}
            >
              Retirada
            </button>
            <button
              onClick={() => setOrderType("delivery")}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                orderType === "delivery" ? "bg-card shadow-card" : "text-muted-foreground"
              }`}
            >
              Entrega
            </button>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nome do cliente"
              className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
            />
            {orderType === "dine_in" && (
              <input
                type="text"
                value={tableLabel}
                onChange={(e) => setTableLabel(e.target.value)}
                placeholder="Número da mesa"
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
              />
            )}
            {orderType === "delivery" && (
              <>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Endereço de entrega"
                  rows={2}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
                />
                <select
                  value={neighborhoodId}
                  onChange={(e) => setNeighborhoodId(e.target.value)}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
                >
                  <option value="">Bairro (obrigatório)</option>
                  {activeNeighborhoods.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} — {currency(n.delivery_fee)}
                    </option>
                  ))}
                </select>
                {activeDrivers.length > 0 && (
                  <select
                    value={deliveryDriverId}
                    onChange={(e) => setDeliveryDriverId(e.target.value)}
                    className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
                  >
                    <option value="">Motoboy (opcional)</option>
                    {activeDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={paymentMethod}
                  onChange={(e) => {
                    const value = e.target.value as typeof paymentMethod;
                    setPaymentMethod(value);
                    if (value !== "cash") setChangeFor("");
                  }}
                  className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
                >
                  <option value="">Forma de pagamento (opcional)</option>
                  <option value="cash">Dinheiro</option>
                  <option value="card">Cartão</option>
                  <option value="pix">Pix</option>
                </select>
                {paymentMethod === "cash" && (
                  <div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={changeFor}
                      onChange={(e) => setChangeFor(e.target.value)}
                      placeholder="Troco para quanto? (opcional)"
                      className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
                    />
                    {changeForInvalid && (
                      <p className="mt-1 text-xs text-destructive">O troco precisa ser maior ou igual ao total do pedido</p>
                    )}
                  </div>
                )}
              </>
            )}
            {activeWaiters.length > 0 && (
              <select
                value={waiterId}
                onChange={(e) => setWaiterId(e.target.value)}
                className="w-full rounded-xl border border-border px-3 py-2.5 text-sm"
              >
                <option value="">Garçom (opcional)</option>
                {activeWaiters.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>

        <div className="border-t border-border p-4">
          {orderType === "delivery" ? (
            <div className="mb-3 space-y-1 text-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Subtotal itens</span>
                <span>{currency(itemsSubtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Taxa de entrega</span>
                <span>{currency(deliveryFee)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-1.5">
                <span className="text-base font-bold">Total</span>
                <span className="text-2xl font-bold">{currency(total)}</span>
              </div>
            </div>
          ) : (
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-semibold">Total</span>
              <span className="font-bold">{currency(total)}</span>
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={
              cart.length === 0 ||
              !customerName.trim() ||
              (orderType === "dine_in" && !tableLabel.trim()) ||
              (orderType === "delivery" && (!deliveryAddress.trim() || !neighborhoodId)) ||
              changeForInvalid ||
              submitting
            }
            className="w-full rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:brightness-105 disabled:opacity-40"
          >
            {submitting ? "Lançando..." : "Lançar pedido"}
          </button>
        </div>
      </div>
    </div>

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
