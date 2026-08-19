import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// meta_pixel_id mora em restaurant_branding (não em restaurants) porque a
// RLS de UPDATE em restaurants é admin-only de propósito (migration 0049) —
// restaurant_branding já permite o próprio staff/dono escrever na própria
// linha, mesmo padrão de logo/cor/nome de exibição (ver branding.ts).
export function useMarketingSettings(restaurantId: string | null) {
  const [pixelId, setPixelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("restaurant_branding")
      .select("meta_pixel_id")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    setPixelId(data?.meta_pixel_id ?? null);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function savePixelId(nextPixelId: string | null): Promise<string | null> {
    if (!restaurantId) return "Restaurante não encontrado.";
    const { error } = await supabase
      .from("restaurant_branding")
      .upsert({ restaurant_id: restaurantId, meta_pixel_id: nextPixelId?.trim() || null });
    if (error) return error.message;
    setPixelId(nextPixelId?.trim() || null);
    return null;
  }

  return { pixelId, loading, savePixelId };
}
