import { useEffect, useState } from "react";
import { supabase } from "./supabase";

const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL;

// Usa a mesa mais antiga do restaurante só como porta de entrada pra
// pré-visualização — o cardápio mostrado é sempre o real, não uma cópia.
export function usePreviewLink(restaurantId: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId || !STOREFRONT_URL) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("tables")
      .select("qr_token")
      .eq("restaurant_id", restaurantId)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setUrl(data ? `${STOREFRONT_URL}/mesa/${data.qr_token}` : null);
        setLoading(false);
      });
  }, [restaurantId]);

  return { url, loading };
}
