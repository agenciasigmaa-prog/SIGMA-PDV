import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type Branding = {
  display_name: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
};

const EMPTY_BRANDING: Branding = { display_name: null, logo_url: null, favicon_url: null, primary_color: null };

export function useBranding(restaurantId: string | null) {
  const [branding, setBranding] = useState<Branding | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("restaurant_branding")
      .select("display_name, logo_url, favicon_url, primary_color")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    setBranding(data ?? EMPTY_BRANDING);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(restaurantId: string, input: Branding) {
    await supabase.from("restaurant_branding").upsert({ restaurant_id: restaurantId, ...input });
    await load();
  }

  return { branding, loading, reload: load, save };
}
