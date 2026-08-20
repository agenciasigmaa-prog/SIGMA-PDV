import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "./supabase";

export type DemandReason = "motoboy_faltou" | "chuva" | "cozinheiro_faltou" | "alta_demanda" | "outro";

export const DEMAND_REASON_LABEL: Record<DemandReason, string> = {
  motoboy_faltou: "Motoboy faltou",
  chuva: "Chuva",
  cozinheiro_faltou: "Cozinheiro faltou",
  alta_demanda: "Alta demanda",
  outro: "Outro",
};

export type DemandAdjustment = {
  extraMinutes: number;
  extraFee: number;
  reason: DemandReason | null;
  reasonOther: string | null;
  expiresAt: string;
};

type BrandingRow = {
  demand_extra_minutes: number | null;
  demand_extra_fee: number | null;
  demand_reason: string | null;
  demand_reason_other: string | null;
  demand_expires_at: string | null;
};

function toAdjustment(row: BrandingRow | null): DemandAdjustment | null {
  if (!row?.demand_expires_at) return null;
  if (new Date(row.demand_expires_at).getTime() <= Date.now()) return null;
  return {
    extraMinutes: row.demand_extra_minutes ?? 0,
    extraFee: Number(row.demand_extra_fee ?? 0),
    reason: (row.demand_reason as DemandReason | null) ?? null,
    reasonOther: row.demand_reason_other,
    expiresAt: row.demand_expires_at,
  };
}

// Ajuste temporário de tempo/taxa de entrega ("alta demanda", motoboy
// faltou, chuva etc.) — igual ao "Gestor de Pedidos" do iFood. Mora em
// restaurant_branding (uma linha por restaurante, staff já tem RLS de
// escrita nela — mesmo raciocínio do meta_pixel_id, ver marketing.ts) em
// vez de tabela nova: só existe um ajuste ativo por vez, então uma linha só
// já basta. Quem de fato soma a taxa extra no pedido é o servidor
// (place-dine-in-order) — este hook só lê/escreve a configuração, nunca
// calcula preço.
export function useDemandAdjustment(restaurantId: string | null) {
  const [row, setRow] = useState<BrandingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [, forceTick] = useState(0);
  const instanceId = useId();

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("restaurant_branding")
      .select("demand_extra_minutes, demand_extra_fee, demand_reason, demand_reason_other, demand_expires_at")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    setRow(data ?? null);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`demand-adjustment-${restaurantId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_branding", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, load, instanceId]);

  // Expira sozinho — sem isso, o banner só sumiria da tela quando alguém
  // mais mexesse na configuração depois do horário passar.
  useEffect(() => {
    const id = setInterval(() => forceTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  async function setAdjustment(input: {
    extraMinutes: number;
    extraFee: number;
    reason: DemandReason;
    reasonOther: string | null;
    durationMinutes: number;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!restaurantId) return { ok: false, error: "Restaurante não encontrado." };
    const expiresAt = new Date(Date.now() + input.durationMinutes * 60_000).toISOString();
    const { error } = await supabase.from("restaurant_branding").upsert({
      restaurant_id: restaurantId,
      demand_extra_minutes: input.extraMinutes,
      demand_extra_fee: input.extraFee,
      demand_reason: input.reason,
      demand_reason_other: input.reason === "outro" ? input.reasonOther?.trim() || null : null,
      demand_expires_at: expiresAt,
    });
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }

  async function clearAdjustment(): Promise<{ ok: boolean; error?: string }> {
    if (!restaurantId) return { ok: false, error: "Restaurante não encontrado." };
    const { error } = await supabase
      .from("restaurant_branding")
      .update({
        demand_extra_minutes: null,
        demand_extra_fee: null,
        demand_reason: null,
        demand_reason_other: null,
        demand_expires_at: null,
      })
      .eq("restaurant_id", restaurantId);
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }

  return { adjustment: toAdjustment(row), loading, setAdjustment, clearAdjustment };
}
