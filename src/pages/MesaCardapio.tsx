import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Header } from "../components/Header";
import { CategoryTabs } from "../components/CategoryTabs";
import { ProductCard } from "../components/ProductCard";
import { OrderBar } from "../components/OrderBar";
import { PromoCarousel } from "../components/PromoCarousel";
import { CartDrawer } from "../components/CartDrawer";
import { PriceChangeDialog } from "../components/PriceChangeDialog";
import { ProductDetailSheet } from "../components/ProductDetailSheet";
import { HalfAndHalfChoiceDialog } from "../components/HalfAndHalfChoiceDialog";
import { CustomerAuthModal } from "../components/CustomerAuthModal";
import { AccountOverlay } from "../components/AccountOverlay";
import { useTableContext } from "../lib/TableContext";
import { useSession } from "../lib/useSession";
import { useMyOrder } from "../lib/myOrder";
import { useOrderChannel } from "../lib/OrderChannelContext";
import { useMenu } from "../lib/useMenu";
import { useCart, type CartAddon, type CartComboChoice, type CartHalfFlavor } from "../lib/CartContext";
import { useCustomerAddresses } from "../lib/customerAddresses";
import { emptyDeliveryDetails, type DeliveryDetails } from "../lib/orderCheckout";
import { supabase } from "../lib/supabase";
import { describeFunctionError } from "../lib/functionError";
import { checkCartPrices, type CartPriceCheckResult } from "../lib/cartPriceCheck";
import { trackPurchase } from "../lib/metaPixel";
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
  const { session, isRealCustomer, profile, loading: sessionLoading } = useSession();
  const { order: myOrder, loading: myOrderLoading } = useMyOrder(restaurantId, isRealCustomer ? (session?.user.id ?? null) : null);
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
  // Produto aguardando a escolha "inteira ou meio a meio?" (popup separado,
  // antes da ficha normal) — e o sabor já escolhido lá, só pra pré-marcar a
  // seção "Meio a meio" quando a ficha abrir.
  const [halfAndHalfPrompt, setHalfAndHalfPrompt] = useState<Product | null>(null);
  const [initialHalfFlavorId, setInitialHalfFlavorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  // Digitados pelo cliente na hora de confirmar — não existe mais mesa fixa
  // vinda de QR. Texto livre, sem validar contra nada (decisão explícita).
  // "?mesa=" na URL (link gerado na aba Marketing pra colar num adesivo de
  // mesa) pré-preenche esse campo — lido só uma vez, no primeiro valor de
  // useState, não via useEffect: assim não sobrescreve o que o cliente já
  // tiver digitado se o componente re-renderizar.
  const [customerName, setCustomerName] = useState("");
  const [tableLabel, setTableLabel] = useState(() => new URLSearchParams(window.location.search).get("mesa") ?? "");
  const [deliveryDetails, setDeliveryDetails] = useState<DeliveryDetails>(emptyDeliveryDetails);
  // Dado do último pedido confirmado, só o necessário pra mensagem de
  // confirmação variar por canal (mesa/código de retirada/endereço).
  const [lastOrderInfo, setLastOrderInfo] = useState<{ tableLabel: string; pickupCode: string | null; address: string } | null>(
    null,
  );
  // O que fazer depois de logar: veio do checkout (então submete o pedido
  // na sequência) ou veio do botão de conta no Header (então só fecha o
  // popup) ou do clique no carrinho — sem isso, logar pelo botão de conta
  // dispararia submitOrder() por engano.
  const [authIntent, setAuthIntent] = useState<"checkout" | "profile" | "cart" | null>(null);
  // Guarda o resultado da autenticação (modo + intent) até o `profile` do
  // useSession() terminar de carregar — profile só é buscado DEPOIS que
  // session muda, então não dá pra decidir nada direto dentro do callback
  // síncrono onAuthenticated (profile ainda pode estar desatualizado nesse
  // instante). Um useEffect observando isRealCustomer/profile/sessionLoading
  // resolve isso quando o dado já estiver pronto de verdade.
  const [pendingAuth, setPendingAuth] = useState<{ mode: "login" | "signup"; intent: "checkout" | "profile" | "cart" } | null>(null);
  // Qual seção da tela cheia "Minha conta" está aberta (null = fechada).
  const [accountSection, setAccountSection] = useState<"profile" | "orders" | null>(null);
  // Aviso mostrado no topo de "Meu perfil" quando a tela abriu forçada por
  // falta de telefone — muda o texto conforme veio de um cadastro novo ou de
  // um pedido bloqueado.
  const [phoneRequiredNotice, setPhoneRequiredNotice] = useState<"checkout" | "signup" | null>(null);
  // true quando o cliente foi mandado pra "Meu perfil" especificamente por
  // causa do telefone faltando na hora de confirmar o pedido — ao salvar o
  // telefone, retoma o pedido sozinho em vez de deixá-lo parado na tela de
  // perfil sem entender por quê.
  const [pendingCheckoutAfterProfile, setPendingCheckoutAfterProfile] = useState(false);
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

  // Pré-seleciona o endereço salvo mais recente assim que a lista carrega,
  // pra abrir o carrinho de delivery direto no resumo compacto (com
  // "Trocar") em vez de forçar o cliente a tocar em "Novo endereço" toda
  // vez. Só roda uma vez (ref) e só se nada foi tocado ainda — depois que o
  // cliente escolhe "Novo endereço" (que também zera selectedSavedAddressId)
  // a ref já vai ter disparado antes disso na prática, já que os endereços
  // carregam no mount, bem antes do carrinho ser aberto.
  const addressDefaultAppliedRef = useRef(false);
  useEffect(() => {
    if (addressDefaultAppliedRef.current) return;
    if (orderType !== "delivery" || savedAddresses.length === 0) return;
    addressDefaultAppliedRef.current = true;
    if (deliveryDetails.selectedSavedAddressId != null) return;
    if (deliveryDetails.addressText !== "" || deliveryDetails.newAddressLabel !== "") return;
    setDeliveryDetails((prev) => ({ ...prev, selectedSavedAddressId: savedAddresses[0].id }));
  }, [savedAddresses, orderType, deliveryDetails]);

  // Cliente logado não devia precisar digitar o próprio nome de novo — puxa
  // do perfil assim que carrega. Continua editável (pedido pra outra pessoa
  // na mesma mesa, por exemplo), só não força digitar do zero toda vez.
  useEffect(() => {
    if (profile?.full_name && !customerName) setCustomerName(profile.full_name);
  }, [profile, customerName]);

  // Bairro não fica gravado no endereço salvo (ele é global, reaproveitável
  // em qualquer restaurante — cada restaurante tem seus próprios bairros e
  // taxas). Mas dá pra lembrar qual foi o último bairro usado PARA ESSE
  // restaurante com ESSE endereço, puxando do pedido anterior — evita
  // escolher nesse dropdown de novo toda vez que o mesmo endereço é
  // reutilizado no mesmo restaurante. Só dispara quando o endereço
  // selecionado muda (troca de endereço ou pré-seleção inicial), nunca
  // sozinho depois que o cliente já escolheu o bairro manualmente pra essa
  // mesma seleção.
  const lastNeighborhoodLookupIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (orderType !== "delivery") return;
    const addressId = deliveryDetails.selectedSavedAddressId;
    if (addressId === lastNeighborhoodLookupIdRef.current) return;
    lastNeighborhoodLookupIdRef.current = addressId;
    if (!addressId) return;
    const address = savedAddresses.find((a) => a.id === addressId);
    if (!address) return;
    let cancelled = false;
    supabase
      .from("orders")
      .select("neighborhood_id")
      .eq("restaurant_id", restaurantId)
      .eq("delivery_address->>text", address.address_text)
      .not("neighborhood_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.neighborhood_id) return;
        setDeliveryDetails((prev) => (prev.selectedSavedAddressId === addressId ? { ...prev, neighborhoodId: data.neighborhood_id as string } : prev));
      });
    return () => {
      cancelled = true;
    };
  }, [deliveryDetails.selectedSavedAddressId, orderType, savedAddresses, restaurantId]);

  // phoneOverride existe pro caso "acabou de salvar o telefone e o pedido
  // estava esperando" (handlePhoneSaved) — o profile do useSession() aqui
  // só se atualiza reagindo a mudança de sessão, não a um update de perfil
  // feito de dentro do AccountOverlay (instância separada do hook), então
  // profile?.phone ainda estaria null nesse instante mesmo já tendo sido
  // salvo no banco. Sem override, o pedido sairia sem telefone.
  async function submitOrder(phoneOverride?: string) {
    setSubmitting(true);
    setError(null);
    const phone = phoneOverride ?? profile?.phone;
    const { data, error: fnError } = await supabase.functions.invoke("place-dine-in-order", {
      body: {
        restaurant_id: restaurantId,
        customer_name: customerName,
        // Telefone do perfil do cliente logado — aparece na comanda pro
        // staff/entregador, e é o mesmo campo usado pra vincular pedidos
        // lançados manualmente quando essa conta ainda não existia. Nunca
        // deveria faltar aqui de verdade: goToLoginOrSubmit()/pendingAuth já
        // bloqueiam o checkout até ter telefone (ver useEffect acima).
        ...(phone ? { customer_phone: phone } : {}),
        order_type: orderType,
        table_label: orderType === "dine_in" ? tableLabel : undefined,
        // Pagamento é perguntado pra mesa também, não só delivery — payload
        // precisa mandar payment_method/change_for nos dois casos, senão a
        // resposta do usuário no formulário nunca chega no servidor.
        ...(orderType === "delivery" || orderType === "dine_in"
          ? {
              payment_method: deliveryDetails.paymentMethod,
              ...(deliveryDetails.wantsChange && deliveryDetails.changeFor
                ? { change_for: Number(deliveryDetails.changeFor) }
                : {}),
            }
          : {}),
        ...(orderType === "delivery"
          ? {
              delivery_address: resolvedAddressText,
              neighborhood_id: deliveryDetails.neighborhoodId,
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
    // Nome do endereço (Casa/Trabalho/...) é opcional, escolhido no checkout.
    if (orderType === "delivery" && deliveryDetails.selectedSavedAddressId == null) {
      saveAddress(resolvedAddressText, deliveryDetails.newAddressLabel);
    }
    // Conversão de verdade pro Meta Pixel (não só PageView) — o que deixa o
    // anúncio ser otimizado pra quem realmente pede, não só quem visita.
    // Sem efeito se o restaurante não tem pixel configurado (aba Marketing).
    trackPurchase(data.total as number);
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
    if (!isRealCustomer) {
      setAuthIntent("checkout");
      return;
    }
    // Telefone é obrigatório pra pedir, não só um campo do formulário de
    // cadastro — cliente que entrou com Google (nunca traz telefone) ou uma
    // conta antiga sem telefone preenchido fica bloqueado aqui até completar.
    if (!profile?.phone) {
      setPendingCheckoutAfterProfile(true);
      setPhoneRequiredNotice("checkout");
      setAccountSection("profile");
      return;
    }
    await submitOrder();
  }

  // Resolve o que fazer depois de uma autenticação (login ou cadastro) só
  // quando profile já tiver carregado de verdade — ver comentário na
  // declaração de pendingAuth. Login nunca abre "Minha conta" sozinho, em
  // nenhum caso (mesmo vindo do ícone de conta) — só cadastro sem telefone
  // faz sentido abrir automaticamente, e checkout sem telefone é bloqueado
  // igual a goToLoginOrSubmit acima.
  useEffect(() => {
    if (!pendingAuth || !isRealCustomer || sessionLoading) return;
    const { mode, intent } = pendingAuth;
    setPendingAuth(null);
    const hasPhone = !!profile?.phone;

    if (intent === "cart") {
      setCartOpen(true);
      return;
    }
    if (intent === "checkout") {
      if (hasPhone) {
        submitOrder();
      } else {
        setPendingCheckoutAfterProfile(true);
        setPhoneRequiredNotice(mode === "signup" ? "signup" : "checkout");
        setAccountSection("profile");
      }
      return;
    }
    // intent === "profile"
    if (mode === "signup" && !hasPhone) {
      setPhoneRequiredNotice("signup");
      setAccountSection("profile");
    }
    // login (ou cadastro que já trouxe telefone): não abre nada sozinho.
  }, [pendingAuth, isRealCustomer, profile, sessionLoading]);

  // Chamado pelo AccountOverlay quando o telefone é salvo com sucesso —
  // retoma o pedido que ficou esperando, se houver. Recebe o telefone salvo
  // direto (não só um sinal) e passa pra submitOrder como override — ver
  // comentário em submitOrder sobre por que não dá pra confiar em
  // profile?.phone logo em seguida a esse save.
  function handlePhoneSaved(phone: string) {
    setPhoneRequiredNotice(null);
    if (pendingCheckoutAfterProfile) {
      setPendingCheckoutAfterProfile(false);
      setAccountSection(null);
      submitOrder(phone);
    }
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
  // lista, mesma lógica pra produto simples ou com adicionais. Categoria com
  // meio a meio ativo (e pelo menos outro produto pra combinar) pergunta
  // "inteira ou meio a meio?" ANTES de abrir a ficha, em vez de deixar essa
  // escolha só como mais uma seção dentro dela.
  function handleOpenDetail(product: Product) {
    const category = categoriesById.get(product.category_id ?? "");
    const hasHalfAndHalfOptions =
      !!category?.allow_half_and_half &&
      products.some((p) => p.category_id === product.category_id && p.id !== product.id);
    if (hasHalfAndHalfOptions) {
      setHalfAndHalfPrompt(product);
    } else {
      setPickerProduct(product);
    }
  }

  function handleChooseWhole() {
    const product = halfAndHalfPrompt;
    setHalfAndHalfPrompt(null);
    if (product) setPickerProduct(product);
  }

  function handleChooseHalf(flavor: Product) {
    const product = halfAndHalfPrompt;
    setHalfAndHalfPrompt(null);
    setInitialHalfFlavorId(flavor.id);
    if (product) setPickerProduct(product);
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
    setInitialHalfFlavorId(null);
  }

  function handleIncrement(lineId: string) {
    const line = items.find((item) => item.lineId === lineId);
    if (line) setQuantity(lineId, line.quantity + 1);
  }

  function handleDecrement(lineId: string) {
    const line = items.find((item) => item.lineId === lineId);
    if (line) setQuantity(lineId, line.quantity - 1);
  }

  // Login exigido já ao ABRIR a sacola, não só na hora de confirmar — decisão
  // explícita: deixar a pessoa montar o pedido todo e só pedir login no fim
  // significa perder o lead se ela desistir antes de logar. Pedindo aqui, o
  // cadastro/login acontece cedo e os dados (nome, endereços salvos) já
  // ficam disponíveis pro resto da jornada.
  function handleCartClick() {
    if (!isRealCustomer) {
      setAuthIntent("cart");
      return;
    }
    setCartOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        restaurantName={restaurantName}
        logoUrl={logoUrl}
        cartCount={totalCount}
        onCartClick={handleCartClick}
        onAccountClick={() => (isRealCustomer ? setAccountSection("profile") : setAuthIntent("profile"))}
        showSearch={showSearchBar}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onExpandSearch={() => setSearchExpanded(true)}
        onCollapseSearch={handleCollapseSearch}
        showMyOrder={isRealCustomer}
        myOrderActive={!!myOrder && myOrder.status !== "completed" && myOrder.status !== "cancelled"}
        onMyOrderClick={() => setAccountSection("orders")}
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

      <OrderBar itemCount={totalCount} subtotal={subtotal} onClick={handleCartClick} />

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
        addresses={savedAddresses}
        onCustomerNameChange={setCustomerName}
        onTableLabelChange={setTableLabel}
        onDeliveryDetailsChange={setDeliveryDetails}
        onClose={() => setCartOpen(false)}
        onIncrement={handleIncrement}
        onDecrement={handleDecrement}
        onConfirm={confirmOrder}
      />

      {halfAndHalfPrompt && (
        <HalfAndHalfChoiceDialog
          product={halfAndHalfPrompt}
          options={products.filter(
            (p) => p.category_id === halfAndHalfPrompt.category_id && p.id !== halfAndHalfPrompt.id,
          )}
          onClose={() => setHalfAndHalfPrompt(null)}
          onChooseWhole={handleChooseWhole}
          onChooseHalf={handleChooseHalf}
        />
      )}

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
          initialHalfFlavorId={initialHalfFlavorId}
          comboChoiceGroups={(comboChoiceGroupsByProduct.get(pickerProduct.id) ?? []).map((group) => ({
            id: group.id,
            name: group.name,
            options: group.options.flatMap((opt) => {
              const found = products.find((p) => p.id === opt.productId);
              return found ? [found] : [];
            }),
          }))}
          removableIngredients={removableIngredientsByProduct.get(pickerProduct.id)}
          onClose={() => {
            setPickerProduct(null);
            setInitialHalfFlavorId(null);
          }}
          onConfirm={handlePickerConfirm}
        />
      )}

      {authIntent && (
        <CustomerAuthModal
          onClose={() => setAuthIntent(null)}
          onAuthenticated={(mode) => {
            setPendingAuth({ mode, intent: authIntent });
            setAuthIntent(null);
          }}
        />
      )}

      {accountSection && (
        <AccountOverlay
          section={accountSection}
          onSectionChange={setAccountSection}
          onClose={() => {
            setAccountSection(null);
            setPhoneRequiredNotice(null);
          }}
          order={myOrder}
          orderLoading={myOrderLoading}
          phoneRequiredNotice={phoneRequiredNotice}
          onPhoneSaved={handlePhoneSaved}
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
