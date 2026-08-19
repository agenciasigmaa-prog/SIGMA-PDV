import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { describeFunctionError } from "./functionError";

export type BusinessHour = {
  day_of_week: number; // 0 = domingo … 6 = sábado
  opens_at: string | null; // "HH:MM"
  closes_at: string | null;
  closed: boolean;
};

export const DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function emptyWeek(): BusinessHour[] {
  return Array.from({ length: 7 }, (_, day_of_week) => ({ day_of_week, opens_at: null, closes_at: null, closed: true }));
}

// restaurants_select_public já é leitura pública (using (true)), então o
// dono lê a própria linha normal — só a escrita passa pela Edge Function
// restaurant-settings (RLS de UPDATE em restaurants é admin-only, de
// propósito, ver a migration 0049).
export function useRestaurantSettings(restaurantId: string | null) {
  const [orderingEnabled, setOrderingEnabledState] = useState(true);
  const [hours, setHoursState] = useState<BusinessHour[]>(emptyWeek());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: restaurant }, { data: hourRows }] = await Promise.all([
      supabase.from("restaurants").select("ordering_enabled").eq("id", restaurantId).maybeSingle(),
      supabase.from("business_hours").select("day_of_week, opens_at, closes_at, closed").eq("restaurant_id", restaurantId),
    ]);
    setOrderingEnabledState(restaurant?.ordering_enabled ?? true);
    const week = emptyWeek();
    for (const row of (hourRows as BusinessHour[] | null) ?? []) {
      week[row.day_of_week] = {
        day_of_week: row.day_of_week,
        opens_at: row.opens_at?.slice(0, 5) ?? null,
        closes_at: row.closes_at?.slice(0, 5) ?? null,
        closed: row.closed,
      };
    }
    setHoursState(week);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  async function setOrderingEnabled(enabled: boolean): Promise<string | null> {
    const { error } = await supabase.functions.invoke("restaurant-settings", {
      body: { action: "set_ordering_enabled", ordering_enabled: enabled },
    });
    if (error) return await describeFunctionError(error);
    setOrderingEnabledState(enabled);
    return null;
  }

  async function saveHours(nextHours: BusinessHour[]): Promise<string | null> {
    const { error } = await supabase.functions.invoke("restaurant-settings", {
      body: { action: "set_business_hours", hours: nextHours },
    });
    if (error) return await describeFunctionError(error);
    setHoursState(nextHours);
    return null;
  }

  return { orderingEnabled, hours, loading, setOrderingEnabled, saveHours };
}
