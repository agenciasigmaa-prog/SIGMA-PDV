import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

type TableInfo = {
  tableId: string;
  tableLabel: string;
  restaurantId: string;
  restaurantName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string | null;
};

const TableContext = createContext<TableInfo | null>(null);

export function useTableContext() {
  const value = useContext(TableContext);
  if (!value) throw new Error("useTableContext must be used within a TableProvider");
  return value;
}

export function TableProvider({ token, children }: { token: string; children: ReactNode }) {
  const [state, setState] = useState<"loading" | "not-found" | "ready">("loading");
  const [info, setInfo] = useState<TableInfo | null>(null);

  useEffect(() => {
    setState("loading");
    supabase
      .from("tables")
      .select(
        "id, label, restaurant_id, restaurants(name, restaurant_branding(display_name, logo_url, favicon_url, primary_color))",
      )
      .eq("qr_token", token)
      .maybeSingle()
      .then(({ data }) => {
        const restaurant = data?.restaurants as unknown as {
          name: string;
          restaurant_branding: {
            display_name: string | null;
            logo_url: string | null;
            favicon_url: string | null;
            primary_color: string | null;
          } | null;
        } | null;
        if (!data || !restaurant) {
          setState("not-found");
          return;
        }
        setInfo({
          tableId: data.id,
          tableLabel: data.label,
          restaurantId: data.restaurant_id,
          restaurantName: restaurant.restaurant_branding?.display_name || restaurant.name,
          logoUrl: restaurant.restaurant_branding?.logo_url ?? null,
          faviconUrl: restaurant.restaurant_branding?.favicon_url ?? null,
          primaryColor: restaurant.restaurant_branding?.primary_color ?? null,
        });
        setState("ready");
      });
  }, [token]);

  // Aplica a cor da marca só enquanto essa mesa está montada — some se sair
  // pra uma tela sem contexto de restaurante.
  useEffect(() => {
    if (!info?.primaryColor) return;
    document.documentElement.style.setProperty("--color-primary", info.primaryColor);
    return () => {
      document.documentElement.style.removeProperty("--color-primary");
    };
  }, [info?.primaryColor]);

  // Favicon + título da aba — troca o <link rel="icon"> que já existe no
  // index.html (não cria um novo) e volta ao padrão ao sair dessa mesa.
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
        <p className="text-sm text-muted-foreground">Carregando mesa…</p>
      </div>
    );
  }

  if (state === "not-found" || !info) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="text-lg font-bold">Mesa não encontrada</h1>
          <p className="mt-2 text-sm text-muted-foreground">Confira o QR Code da sua mesa e tente novamente.</p>
        </div>
      </div>
    );
  }

  return <TableContext.Provider value={info}>{children}</TableContext.Provider>;
}
