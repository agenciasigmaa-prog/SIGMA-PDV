import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "./supabase";

export type DeliveryDriver = { id: string; name: string; active: boolean };

// Cadastro simples de motoboys — sem senha, sem login individual. CRUD
// direto (RLS já cobre: staff do restaurante pode tudo), sem Edge Function,
// mesmo padrão de `waiters`.
export function useDeliveryDrivers(restaurantId: string | null) {
  const [drivers, setDrivers] = useState<DeliveryDriver[]>([]);
  const [loading, setLoading] = useState(true);
  // Nome de canal único por instância — sem isso, dois mounts concorrentes
  // (StrictMode em dev, ou duas telas usando o hook ao mesmo tempo) reusam
  // o mesmo RealtimeChannel e o segundo `.on()` falha. Mesma correção já
  // aplicada em `waiters.ts`/`autoPrint.ts`.
  const instanceId = useId();

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("delivery_drivers")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name");
    setDrivers(data ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`delivery-drivers-${restaurantId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_drivers", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, load, instanceId]);

  async function createDriver(name: string): Promise<{ ok: boolean; error?: string }> {
    if (!restaurantId) return { ok: false, error: "Restaurante não identificado" };
    const { error } = await supabase.from("delivery_drivers").insert({ restaurant_id: restaurantId, name });
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }

  async function setDriverActive(driverId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.from("delivery_drivers").update({ active }).eq("id", driverId);
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }

  return { drivers, loading, createDriver, setDriverActive };
}

function storageKey(restaurantId: string) {
  return `sigma-motoboy-${restaurantId}`;
}

// Seleção local de "quem está entregando" — mesmo padrão de
// `useSelectedWaiter`: não é autenticação, é preferência do dispositivo
// guardada em localStorage, validada contra a lista carregada e limpa
// sozinha se o id não existir mais.
export function useSelectedDeliveryDriver(restaurantId: string | null, drivers: DeliveryDriver[]) {
  const [selectedId, setSelectedIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    const stored = window.localStorage.getItem(storageKey(restaurantId));
    setSelectedIdState(stored);
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId || drivers.length === 0 || !selectedId) return;
    if (!drivers.some((d) => d.id === selectedId)) {
      window.localStorage.removeItem(storageKey(restaurantId));
      setSelectedIdState(null);
    }
  }, [restaurantId, drivers, selectedId]);

  function setSelectedId(driverId: string | null) {
    setSelectedIdState(driverId);
    if (!restaurantId) return;
    if (driverId) window.localStorage.setItem(storageKey(restaurantId), driverId);
    else window.localStorage.removeItem(storageKey(restaurantId));
  }

  return { selectedId, setSelectedId };
}
