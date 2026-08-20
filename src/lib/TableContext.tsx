import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { initMetaPixel } from "./metaPixel";
import { useSession } from "./useSession";

type RestaurantInfo = {
  restaurantId: string;
  restaurantName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
  orderingEnabled: boolean;
  metaPixelId: string | null;
};

const RestaurantContext = createContext<RestaurantInfo | null>(null);

export function useTableContext() {
  const value = useContext(RestaurantContext);
  if (!value) throw new Error("useTableContext must be used within a TableProvider");
  return value;
}

// Não existe mais mesa fixa por QR — o link é por restaurante (só abre o
// cardápio); a mesa é digitada pelo cliente na hora de confirmar o pedido.
// Aceita restaurantId (rota /loja/:id) OU slug (subdomínio) — sempre um dos
// dois, nunca os dois ao mesmo tempo.
export function TableProvider({
  restaurantId,
  slug,
  children,
}: {
  restaurantId?: string;
  slug?: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [info, setInfo] = useState<RestaurantInfo | null>(null);
  const lookupColumn = slug ? "slug" : "id";
  const lookupValue = slug ?? restaurantId;
  const { session, isRealCustomer } = useSession();

  useEffect(() => {
    if (!lookupValue) {
      setState("not-found");
      return;
    }
    setState("loading");
    supabase
      .from("restaurants")
      .select(
        "id, name, ordering_enabled, restaurant_branding(display_name, logo_url, favicon_url, primary_color, meta_pixel_id)",
      )
      .eq(lookupColumn, lookupValue)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          setState("not-found");
          return;
        }
        const branding = data.restaurant_branding as unknown as {
          display_name: string | null;
          logo_url: string | null;
          favicon_url: string | null;
          primary_color: string | null;
          meta_pixel_id: string | null;
        } | null;
        setInfo({
          restaurantId: data.id,
          restaurantName: branding?.display_name || data.name,
          logoUrl: branding?.logo_url ?? null,
          faviconUrl: branding?.favicon_url ?? null,
          primaryColor: branding?.primary_color ?? null,
          orderingEnabled: data.ordering_enabled,
          metaPixelId: branding?.meta_pixel_id ?? null,
        });
        setState("ready");
      });
  }, [lookupColumn, lookupValue]);

  // Pixel carrega assim que o restaurante resolve — mede visitas ao cardápio
  // (PageView) pra quem chegou via anúncio; a conversão de verdade
  // ("Purchase") dispara em MesaCardapio.tsx na confirmação do pedido.
  useEffect(() => {
    if (info?.metaPixelId) initMetaPixel(info.metaPixelId);
  }, [info?.metaPixelId]);

  // Criar conta ou logar no cardápio já vincula o cliente a ESTE
  // restaurante (aparece na aba Clientes de restaurante/), mesmo sem nenhum
  // pedido ainda — antes só um pedido feito criava esse vínculo. Upsert
  // idempotente (ignora se já existe); o mesmo cliente pode acumular um
  // vínculo por restaurante cujo cardápio visitou logado.
  useEffect(() => {
    if (!info || !isRealCustomer || !session) return;
    supabase
      .from("restaurant_customer_links")
      .upsert(
        { restaurant_id: info.restaurantId, customer_id: session.user.id },
        { onConflict: "restaurant_id,customer_id", ignoreDuplicates: true },
      )
      .then(() => {});
  }, [info, isRealCustomer, session]);

  // Aplica a cor da marca só enquanto esse restaurante está montado — some se
  // sair pra uma tela sem contexto de restaurante.
  useEffect(() => {
    if (!info?.primaryColor) return;
    document.documentElement.style.setProperty("--color-primary", info.primaryColor);
    return () => {
      document.documentElement.style.removeProperty("--color-primary");
    };
  }, [info?.primaryColor]);

  // Favicon + título da aba — troca o <link rel="icon"> que já existe no
  // index.html (não cria um novo) e volta ao padrão ao sair desse restaurante.
  useEffect(() => {
    if (!info) return;
    const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    const previousHref = link?.getAttribute("href") ?? null;
    const previousTitle = document.title;

    if (info.faviconUrl && link) link.setAttribute("href", info.faviconUrl);
    document.title = `${info.restaurantName} — Cardápio`;

    return () => {
      if (link && previousHref) link.setAttribute("href", previousHref);
      document.title = previousTitle;
    };
  }, [info]);

  if (state === "loading") {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <p className="text-sm text-muted-foreground">Carregando cardápio…</p>
      </div>
    );
  }

  if (state === "not-found" || !info) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-lg font-bold">Restaurante não encontrado</h1>
          <p className="mt-2 text-sm text-muted-foreground">Confira o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  // Desativado na tela de Configurações do restaurante (botão "Desativar
  // cardápio") — bloqueia a visita inteira, não só o botão de confirmar,
  // pra não deixar o cliente montar um carrinho que nunca vai poder enviar.
  if (!info.orderingEnabled) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-lg font-bold">{info.restaurantName} está fechado no momento</h1>
          <p className="mt-2 text-sm text-muted-foreground">Não estamos aceitando pedidos agora. Volte mais tarde.</p>
        </div>
      </div>
    );
  }

  return <RestaurantContext.Provider value={info}>{children}</RestaurantContext.Provider>;
}
