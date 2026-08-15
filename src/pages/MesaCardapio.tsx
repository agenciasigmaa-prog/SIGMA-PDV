import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Header } from "../components/Header";
import { CategoryRow } from "../components/CategoryRow";
import { ProductSection } from "../components/ProductSection";
import { PromoCarousel } from "../components/PromoCarousel";
import { CartDrawer } from "../components/CartDrawer";
import { PriceChangeDialog } from "../components/PriceChangeDialog";
import { AddonPickerSheet } from "../components/AddonPickerSheet";
import { useTableContext } from "../lib/TableContext";
import { useMenu } from "../lib/useMenu";
import { useCart, type CartAddon, type CartComboChoice, type CartHalfFlavor } from "../lib/CartContext";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import { checkCartPrices, type CartPriceCheckResult } from "../lib/cartPriceCheck";
import type { Addon, AddonGroup } from "../lib/addons";
import type { PromoBanner } from "../lib/promoBanners";
import type { Product } from "../lib/menu";
import type { RemovableIngredient } from "../lib/removableIngredients";

export function MesaCardapio() {
  const { restaurantId, restaurantName, logoUrl } = useTableContext();
  const {
    categories,
    products,
    addonGroups,
    addons,
    banners,
    comboItemsByProduct,
    comboChoiceGroupsByProduct,
    removableIngredientsByProduct,
    loading,
  } = useMenu(restaurantId);
  const { items, addItem, setQuantity, syncPrices, clear, subtotal, totalCount } = useCart();

  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingPrices, setCheckingPrices] = useState(false);
  const [priceCheck, setPriceCheck] = useState<CartPriceCheckResult | null>(null);
  const [pickerProduct, setPickerProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  // Digitados pelo cliente na hora de confirmar — não existe mais mesa fixa
  // vinda de QR. Texto livre, sem validar contra nada (decisão explícita).
  const [customerName, setCustomerName] = useState("");
  const [tableLabel, setTableLabel] = useState("");
  const [lastOrderTableLabel, setLastOrderTableLabel] = useState("");

  // Somado por produto (não por linha) — é só pra mostrar contagem no card
  // do produto; o carrinho de verdade opera por linha (lineId).
  const quantities = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) map[item.productId] = (map[item.productId] ?? 0) + item.quantity;
    return map;
  }, [items]);

  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const addonGroupsByCategory = useMemo(() => {
    const map = new Map<string, { group: AddonGroup; addons: Addon[] }[]>();
    for (const group of addonGroups) {
      const groupAddons = addons.filter((a) => a.group_id === group.id);
      if (groupAddons.length === 0) continue;
      const list = map.get(group.category_id) ?? [];
      list.push({ group, addons: groupAddons });
      map.set(group.category_id, list);
    }
    return map;
  }, [addonGroups, addons]);

  const grouped = useMemo(() => {
    const categorized = categories
      .map((category) => ({ category, products: products.filter((p) => p.category_id === category.id) }))
      .filter((group) => group.products.length > 0);
    const categoryIds = new Set(categories.map((c) => c.id));
    const uncategorized = products.filter((p) => !p.category_id || !categoryIds.has(p.category_id));
    return { categorized, uncategorized };
  }, [categories, products]);

  async function submitOrder(name: string, table: string) {
    setSubmitting(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("place-dine-in-order", {
      body: {
        restaurant_id: restaurantId,
        customer_name: name,
        table_label: table,
        items: items.map((item) => ({
          product_id: item.productId,
          quantity: item.quantity,
          addons: item.addons.map((addon) => ({ addon_id: addon.addonId, quantity: addon.quantity })),
          ...(item.halfFlavor ? { half_flavor_product_id: item.halfFlavor.productId } : {}),
          ...(item.comboChoices
            ? { combo_choices: item.comboChoices.map((c) => ({ group_id: c.groupId, option_product_id: c.productId })) }
            : {}),
          ...(item.removedIngredients
            ? { removed_ingredient_ids: item.removedIngredients.map((r) => r.ingredientId) }
            : {}),
        })),
      },
    });
    if (fnError) {
      setError(await describeFunctionError(fnError));
      setSubmitting(false);
      return;
    }
    clear();
    setCartOpen(false);
    setOrderId(data.order_id as string);
    setLastOrderTableLabel(table);
    setCustomerName("");
    setTableLabel("");
    setSubmitting(false);
  }

  // Sem exigência de conta/login social por enquanto — decisão explícita
  // (revisitar depois): o pedido só é "indexado" pelo nome/mesa digitados,
  // não por identidade real. signInAnonymously() resolve na hora (sem
  // redirect de página), só pra ter um customer_id/JWT válido pra passar
  // pelo guard requireCustomer() da place-dine-in-order.
  async function goToLoginOrSubmit() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError) {
        setError(await describeFunctionError(signInError));
        return;
      }
    }
    await submitOrder(customerName, tableLabel);
  }

  // Dispara uma única vez, só aqui — nunca em background, nunca de novo
  // sozinho. Se nada mudou no cardápio, segue direto sem interromper.
  async function confirmOrder() {
    setError(null);
    setCheckingPrices(true);
    const result = await checkCartPrices(items);
    setCheckingPrices(false);

    if (result.changes.length > 0 || result.removed.length > 0) {
      setPriceCheck(result);
      return;
    }
    await goToLoginOrSubmit();
  }

  function handleAcceptPriceChanges() {
    if (!priceCheck) return;
    syncPrices(
      priceCheck.changes.map((change) => ({ lineId: change.lineId, price: change.newPrice })),
      priceCheck.removed.map((item) => item.lineId),
    );
    setPriceCheck(null);
    setCartOpen(true);
  }

  function handleCancelPriceChanges() {
    setPriceCheck(null);
    setCartOpen(true);
  }

  function handleSelectBanner(banner: PromoBanner) {
    if (!banner.category_id) return;
    document.getElementById(`categoria-${banner.category_id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleAdd(product: Product) {
    const groups = product.category_id ? addonGroupsByCategory.get(product.category_id) : undefined;
    const category = product.category_id ? categoriesById.get(product.category_id) : undefined;
    const choiceGroups = comboChoiceGroupsByProduct.get(product.id);
    const removable = removableIngredientsByProduct.get(product.id);
    if (
      (groups && groups.length > 0) ||
      category?.allow_half_and_half ||
      (choiceGroups && choiceGroups.length > 0) ||
      (removable && removable.length > 0)
    ) {
      setPickerProduct(product);
      return;
    }
    addItem(product);
  }

  function handlePickerConfirm({
    addons,
    halfFlavor,
    comboChoices,
    removedIngredients,
  }: {
    addons: CartAddon[];
    halfFlavor?: CartHalfFlavor;
    comboChoices?: CartComboChoice[];
    removedIngredients?: RemovableIngredient[];
  }) {
    if (pickerProduct) addItem(pickerProduct, { addons, halfFlavor, comboChoices, removedIngredients });
    setPickerProduct(null);
  }

  function handleRemove(product: Product) {
    const line = items.find(
      (item) =>
        item.productId === product.id &&
        item.addons.length === 0 &&
        !item.halfFlavor &&
        !item.comboChoices &&
        !item.removedIngredients,
    );
    if (line) setQuantity(line.lineId, line.quantity - 1);
  }

  function handleIncrement(lineId: string) {
    const line = items.find((item) => item.lineId === lineId);
    if (line) setQuantity(lineId, line.quantity + 1);
  }

  function handleDecrement(lineId: string) {
    const line = items.find((item) => item.lineId === lineId);
    if (line) setQuantity(lineId, line.quantity - 1);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        restaurantName={restaurantName}
        logoUrl={logoUrl}
        cartCount={totalCount}
        onCartClick={() => setCartOpen(true)}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 pt-4 md:px-6 md:pt-6">
        <div className="space-y-9 md:space-y-12">
          <PromoCarousel banners={banners} onSelect={handleSelectBanner} />
          <CategoryRow categories={categories} />

          {loading && <p className="text-sm text-muted-foreground">Carregando cardápio…</p>}

          {!loading && products.length === 0 && (
            <p className="text-sm text-muted-foreground">Este restaurante ainda não cadastrou itens no cardápio.</p>
          )}

          {grouped.categorized.map(({ category, products: categoryProducts }) => (
            <ProductSection
              key={category.id}
              id={`categoria-${category.id}`}
              title={category.name}
              products={categoryProducts}
              quantities={quantities}
              hasAddons={addonGroupsByCategory.has(category.id)}
              hasHalfAndHalf={category.allow_half_and_half}
              comboItemsByProduct={comboItemsByProduct}
              comboChoiceGroupsByProduct={comboChoiceGroupsByProduct}
              removableIngredientsByProduct={removableIngredientsByProduct}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
          ))}

          {grouped.uncategorized.length > 0 && (
            <ProductSection
              id="categoria-outros"
              title="Outros"
              products={grouped.uncategorized}
              quantities={quantities}
              hasAddons={false}
              comboItemsByProduct={comboItemsByProduct}
              comboChoiceGroupsByProduct={comboChoiceGroupsByProduct}
              removableIngredientsByProduct={removableIngredientsByProduct}
              onAdd={handleAdd}
              onRemove={handleRemove}
            />
          )}
        </div>
      </main>

      <CartDrawer
        open={cartOpen}
        items={items}
        subtotal={subtotal}
        submitting={submitting || checkingPrices}
        error={error}
        customerName={customerName}
        tableLabel={tableLabel}
        onCustomerNameChange={setCustomerName}
        onTableLabelChange={setTableLabel}
        onClose={() => setCartOpen(false)}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        onConfirm={confirmOrder}
      />

      {pickerProduct && (
        <AddonPickerSheet
          product={pickerProduct}
          groups={addonGroupsByCategory.get(pickerProduct.category_id ?? "") ?? []}
          halfAndHalf={
            categoriesById.get(pickerProduct.category_id ?? "")?.allow_half_and_half
              ? {
                  pricingMode: categoriesById.get(pickerProduct.category_id ?? "")!.half_and_half_pricing,
                  options: products.filter((p) => p.category_id === pickerProduct.category_id && p.id !== pickerProduct.id),
                }
              : undefined
          }
          comboChoiceGroups={(comboChoiceGroupsByProduct.get(pickerProduct.id) ?? []).map((group) => ({
            id: group.id,
            name: group.name,
            options: group.options.flatMap((opt) => {
              const found = products.find((p) => p.id === opt.productId);
              return found ? [found] : [];
            }),
          }))}
          removableIngredients={removableIngredientsByProduct.get(pickerProduct.id)}
          onClose={() => setPickerProduct(null)}
          onConfirm={handlePickerConfirm}
        />
      )}

      {priceCheck && (
        <PriceChangeDialog
          result={priceCheck}
          onCancel={handleCancelPriceChanges}
          onAccept={handleAcceptPriceChanges}
        />
      )}

      {orderId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-6">
          <div className="surface-card max-w-sm p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden />
            <h2 className="mt-3 text-lg font-bold">Pedido enviado!</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Seu pedido foi enviado pra cozinha. O garçom vai trazer até a mesa {lastOrderTableLabel}.
            </p>
            <button
              type="button"
              onClick={() => setOrderId(null)}
              className="press mt-4 w-full rounded-full bg-primary py-2.5 text-sm font-bold text-primary-foreground"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
