import { useEffect, useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Header } from "../components/Header";
import { CategoryTabs } from "../components/CategoryTabs";
import { ProductCard } from "../components/ProductCard";
import { OrderBar } from "../components/OrderBar";
import { PromoCarousel } from "../components/PromoCarousel";
import { CartDrawer } from "../components/CartDrawer";
import { PriceChangeDialog } from "../components/PriceChangeDialog";
import { ProductDetailSheet } from "../components/ProductDetailSheet";
import { CustomerAuthModal } from "../components/CustomerAuthModal";
import { useTableContext } from "../lib/TableContext";
import { useOrderChannel } from "../lib/OrderChannelContext";
import { useMenu } from "../lib/useMenu";
import { useCart, type CartAddon, type CartComboChoice, type CartHalfFlavor } from "../lib/CartContext";
import { useCustomerAddresses } from "../lib/customerAddresses";
import { emptyDeliveryDetails, type DeliveryDetails } from "../lib/orderCheckout";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import { checkCartPrices, type CartPriceCheckResult } from "../lib/cartPriceCheck";
import type { Addon, AddonGroup } from "../lib/addons";
import type { PromoBanner } from "../lib/promoBanners";
import type { Product } from "../lib/menu";
import type { RemovableIngredient } from "../lib/removableIngredients";

// Offset das duas barras fixas no topo (Header h-16 + CategoryTabs ~56px) —
// usado tanto no scroll-mt das seções quanto no rootMargin do scroll-spy,
// pra manter os dois em sincronia sem duplicar o número em vários lugares.
const STICKY_HEADER_OFFSET = 128;

export function MesaCardapio() {
  const { restaurantId, restaurantName, logoUrl } = useTableContext();
  const orderType = useOrderChannel();
  const { addresses: savedAddresses, saveAddress } = useCustomerAddresses();
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
  const [deliveryDetails, setDeliveryDetails] = useState<DeliveryDetails>(emptyDeliveryDetails);
  // Dado do último pedido confirmado, só o necessário pra mensagem de
  // confirmação variar por canal (mesa/código de retirada/endereço).
  const [lastOrderInfo, setLastOrderInfo] = useState<{ tableLabel: string; pickupCode: string | null; address: string } | null>(
    null,
  );
  const [showAuthGate, setShowAuthGate] = useState(false);
  // Categoria destacada nas abas fixas — segue a seção mais visível ao rolar
  // (scroll-spy), não uma tela separada. "outros" é o id sintético dos
  // produtos sem categoria.
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  // Header troca de logo pra barra de busca ao rolar pra baixo (em vez de
  // deixar a logo cortada no topo) ou ao tocar na lupa — os dois casos
  // mostram a mesma barra, então usam o mesmo estado visual.
  const [scrolled, setScrolled] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const showSearchBar = scrolled || searchExpanded;

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 160);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function handleCollapseSearch() {
    setSearchExpanded(false);
    setSearchQuery("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

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

  // Filtra por nome/descrição quando a busca está em uso; categoria sem
  // nenhum produto que bata some da lista (mesmo raciocínio que já existia
  // pra categoria vazia, só que aplicado depois do filtro).
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleGrouped = useMemo(() => {
    if (!normalizedQuery) return grouped;
    const matches = (p: Product) =>
      p.name.toLowerCase().includes(normalizedQuery) || (p.description ?? "").toLowerCase().includes(normalizedQuery);
    return {
      categorized: grouped.categorized
        .map((g) => ({ category: g.category, products: g.products.filter(matches) }))
        .filter((g) => g.products.length > 0),
      uncategorized: grouped.uncategorized.filter(matches),
    };
  }, [grouped, normalizedQuery]);

  const tabCategories = useMemo(() => {
    const list = visibleGrouped.categorized.map((g) => ({ id: g.category.id, name: g.category.name }));
    if (visibleGrouped.uncategorized.length > 0) list.push({ id: "outros", name: "Outros" });
    return list;
  }, [visibleGrouped]);

  // Aba ativa acompanha a rolagem: observa todas as seções e destaca a que
  // estiver mais perto do topo (logo abaixo do header + abas fixas).
  useEffect(() => {
    if (tabCategories.length === 0) return;
    const sections = tabCategories
      .map((c) => document.getElementById(`categoria-${c.id}`))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveCategoryId(visible[0].target.id.replace("categoria-", ""));
      },
      { rootMargin: `-${STICKY_HEADER_OFFSET + 8}px 0px -60% 0px`, threshold: 0 },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [tabCategories]);

  function scrollToCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    document.getElementById(`categoria-${categoryId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Endereço final do pedido: se veio de um salvo, usa o texto de lá; senão
  // usa o que foi digitado agora no campo de endereço novo. Mesma lógica do
  // CartDrawer, precisa bater os dois porque um valida o outro grava.
  const resolvedAddressText =
    deliveryDetails.selectedSavedAddressId != null
      ? (savedAddresses.find((a) => a.id === deliveryDetails.selectedSavedAddressId)?.address_text ?? "")
      : deliveryDetails.addressText.trim();

  async function submitOrder() {
    setSubmitting(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("place-dine-in-order", {
      body: {
        restaurant_id: restaurantId,
        customer_name: customerName,
        order_type: orderType,
        table_label: orderType === "dine_in" ? tableLabel : undefined,
        ...(orderType === "delivery"
          ? {
              delivery_address: resolvedAddressText,
              neighborhood_id: deliveryDetails.neighborhoodId,
              payment_method: deliveryDetails.paymentMethod,
              ...(deliveryDetails.wantsChange && deliveryDetails.changeFor
                ? { change_for: Number(deliveryDetails.changeFor) }
                : {}),
            }
          : {}),
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
    // Endereço novo (não escolhido de um já salvo) fica guardado pra próxima
    // vez — não bloqueia a confirmação do pedido se falhar por algum motivo.
    if (orderType === "delivery" && deliveryDetails.selectedSavedAddressId == null) {
      saveAddress(resolvedAddressText);
    }
    clear();
    setCartOpen(false);
    setOrderId(data.order_id as string);
    setLastOrderInfo({
      tableLabel,
      pickupCode: (data.pickup_code as string | null) ?? null,
      address: resolvedAddressText,
    });
    setCustomerName("");
    setTableLabel("");
    setDeliveryDetails(emptyDeliveryDetails());
    setSubmitting(false);
  }

  // Cadastro real (email/senha ou Google) — decisão revisitada: antes o
  // checkout usava signInAnonymously() só pra ter um JWT válido, sem
  // identidade nenhuma por trás. Agora precisa de sessão REAL (não anônima)
  // pra existir um cliente reconhecível entre pedidos/restaurantes (aba
  // Clientes). is_anonymous distingue sessão de convidado de sessão de
  // verdade — sessão anônima antiga que ainda esteja em localStorage não
  // conta como "logado" aqui.
  async function goToLoginOrSubmit() {
    const { data } = await supabase.auth.getSession();
    const hasRealSession = !!data.session && data.session.user.is_anonymous === false;
    if (!hasRealSession) {
      setShowAuthGate(true);
      return;
    }
    await submitOrder();
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
    scrollToCategory(banner.category_id);
  }

  // Toque em qualquer parte da linha do produto abre a ficha (foto,
  // descrição, customização e quantidade) — não tem mais +/- direto na
  // lista, mesma lógica pra produto simples ou com adicionais.
  function handleOpenDetail(product: Product) {
    setPickerProduct(product);
  }

  function handlePickerConfirm({
    addons,
    halfFlavor,
    comboChoices,
    removedIngredients,
    quantity,
  }: {
    addons: CartAddon[];
    halfFlavor?: CartHalfFlavor;
    comboChoices?: CartComboChoice[];
    removedIngredients?: RemovableIngredient[];
    quantity: number;
  }) {
    if (pickerProduct) addItem(pickerProduct, { addons, halfFlavor, comboChoices, removedIngredients, quantity });
    setPickerProduct(null);
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
        showSearch={showSearchBar}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onExpandSearch={() => setSearchExpanded(true)}
        onCollapseSearch={handleCollapseSearch}
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-4 md:px-6 md:pt-6">
        <div className="space-y-8">
          <PromoCarousel banners={banners} onSelect={handleSelectBanner} />

          {/* Rola junto com o banner — só gruda no topo (sticky) depois que
              o cliente passa do banner e ela alcança o header. */}
          <CategoryTabs categories={tabCategories} activeCategoryId={activeCategoryId} onSelect={scrollToCategory} />

          {loading && <p className="text-sm text-muted-foreground">Carregando cardápio…</p>}

          {!loading && products.length === 0 && (
            <p className="text-sm text-muted-foreground">Este restaurante ainda não cadastrou itens no cardápio.</p>
          )}

          {!loading &&
            products.length > 0 &&
            normalizedQuery &&
            visibleGrouped.categorized.length === 0 &&
            visibleGrouped.uncategorized.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum item encontrado pra "{searchQuery}".</p>
            )}

          {visibleGrouped.categorized.map(({ category, products: categoryProducts }) => (
            <section key={category.id} id={`categoria-${category.id}`} style={{ scrollMarginTop: STICKY_HEADER_OFFSET }}>
              <h2 className="mb-1 text-lg font-bold md:text-xl">{category.name}</h2>
              <div>
                {categoryProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    quantity={quantities[product.id] ?? 0}
                    comboItems={comboItemsByProduct.get(product.id)}
                    onOpenDetail={() => handleOpenDetail(product)}
                  />
                ))}
              </div>
            </section>
          ))}

          {visibleGrouped.uncategorized.length > 0 && (
            <section id="categoria-outros" style={{ scrollMarginTop: STICKY_HEADER_OFFSET }}>
              <h2 className="mb-1 text-lg font-bold md:text-xl">Outros</h2>
              <div>
                {visibleGrouped.uncategorized.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    quantity={quantities[product.id] ?? 0}
                    comboItems={comboItemsByProduct.get(product.id)}
                    onOpenDetail={() => handleOpenDetail(product)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <OrderBar itemCount={totalCount} subtotal={subtotal} onClick={() => setCartOpen(true)} />

      <CartDrawer
        open={cartOpen}
        restaurantId={restaurantId}
        orderType={orderType}
        items={items}
        subtotal={subtotal}
        submitting={submitting || checkingPrices}
        error={error}
        customerName={customerName}
        tableLabel={tableLabel}
        deliveryDetails={deliveryDetails}
        onCustomerNameChange={setCustomerName}
        onTableLabelChange={setTableLabel}
        onDeliveryDetailsChange={setDeliveryDetails}
        onClose={() => setCartOpen(false)}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        onConfirm={confirmOrder}
      />

      {pickerProduct && (
        <ProductDetailSheet
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

      {showAuthGate && (
        <CustomerAuthModal
          onClose={() => setShowAuthGate(false)}
          onAuthenticated={() => {
            setShowAuthGate(false);
            submitOrder();
          }}
        />
      )}

      {priceCheck && (
        <PriceChangeDialog
          result={priceCheck}
          onCancel={handleCancelPriceChanges}
          onAccept={handleAcceptPriceChanges}
        />
      )}

      {orderId && lastOrderInfo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-6">
          <div className="surface-card max-w-sm p-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-primary" aria-hidden />
            <h2 className="mt-3 text-lg font-bold">Pedido enviado!</h2>
            {orderType === "dine_in" && (
              <p className="mt-1 text-sm text-muted-foreground">
                Seu pedido foi enviado pra cozinha. O garçom vai trazer até a mesa {lastOrderInfo.tableLabel}.
              </p>
            )}
            {orderType === "pickup" && (
              <>
                <p className="mt-1 text-sm text-muted-foreground">Seu pedido foi enviado pra cozinha. Mostre esse código no balcão:</p>
                <p className="mt-3 text-3xl font-black tracking-widest text-primary">{lastOrderInfo.pickupCode}</p>
              </>
            )}
            {orderType === "delivery" && (
              <p className="mt-1 text-sm text-muted-foreground">
                Seu pedido está a caminho de {lastOrderInfo.address}.
              </p>
            )}
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
