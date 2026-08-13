import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type PromoBanner = {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  image_url: string;
  title: string;
  subtitle: string | null;
  cta_label: string;
  active: boolean;
  sort_order: number;
};

export function usePromoBanners(restaurantId: string | null) {
  const [banners, setBanners] = useState<PromoBanner[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("promo_banners")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("sort_order");
    setBanners((data as PromoBanner[]) ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function createBanner(
    restaurantId: string,
    input: Omit<PromoBanner, "id" | "restaurant_id" | "sort_order">,
  ) {
    const nextOrder = banners.length ? Math.max(...banners.map((b) => b.sort_order)) + 1 : 0;
    await supabase.from("promo_banners").insert({ ...input, restaurant_id: restaurantId, sort_order: nextOrder });
    await load();
  }

  async function updateBanner(id: string, input: Partial<Omit<PromoBanner, "id" | "restaurant_id">>) {
    await supabase.from("promo_banners").update(input).eq("id", id);
    await load();
  }

  async function deleteBanner(id: string) {
    await supabase.from("promo_banners").delete().eq("id", id);
    await load();
  }

  async function moveBanner(id: string, direction: "up" | "down") {
    const sorted = [...banners].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((b) => b.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    await Promise.all([
      supabase.from("promo_banners").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("promo_banners").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    await load();
  }

  return { banners, loading, reload: load, createBanner, updateBanner, deleteBanner, moveBanner };
}
