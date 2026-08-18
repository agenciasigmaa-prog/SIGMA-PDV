import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL;
const APEX_DOMAIN = import.meta.env.VITE_APEX_DOMAIN;

// Não existe mais mesa fixa por QR — o link é por restaurante (só abre o
// cardápio); a mesa é digitada pelo cliente na hora de confirmar o pedido.
// Fica disponível assim que o restaurante existe, sem precisar cadastrar
// nada antes. Prefere o link por subdomínio (<slug>.VITE_APEX_DOMAIN) quando
// o domínio de produção já está configurado; senão cai no link por UUID de
// sempre (/loja/:restaurantId), que continua funcionando nos dois casos.
export function usePreviewLink(restaurantId: string | null) {
  const [slug, setSlug] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setSlug(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("restaurants")
      .select("slug")
      .eq("id", restaurantId)
      .maybeSingle()
      .then(({ data }) => {
        setSlug(data?.slug ?? null);
        setLoading(false);
      });
  }, [restaurantId]);

  if (!restaurantId) return { url: null, loading: false };

  const url =
    slug && APEX_DOMAIN
      ? `https://${slug}.${APEX_DOMAIN}`
      : STOREFRONT_URL
        ? `${STOREFRONT_URL}/loja/${restaurantId}`
        : null;

  return { url, loading };
}
