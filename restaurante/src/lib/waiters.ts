import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "./supabase";

export type Waiter = { id: string; name: string; active: boolean };

// Cadastro simples de garçons — sem senha, sem login individual. CRUD direto
// (RLS já cobre: staff do restaurante pode tudo), sem Edge Function, mesmo
// padrão de `ingredients`.
export function useWaiters(restaurantId: string | null) {
  const [waiters, setWaiters] = useState<Waiter[]>([]);
  const [loading, setLoading] = useState(true);
  // Vários componentes chamam esse hook ao mesmo tempo pro mesmo restaurante
  // (ex: Pedidos.tsx sempre montado + ManualOrderModal aberto por cima) — o
  // nome do canal realtime precisa ser único por instância, senão a segunda
  // assinatura reusa o mesmo `RealtimeChannel` (supabase-js cacheia por
  // tópico) e o `.on()` seguinte falha porque o canal já está inscrito.
  const instanceId = useId();

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("waiters")
      .select("id, name, active")
      .eq("restaurant_id", restaurantId)
      .order("name");
    setWaiters(data ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`waiters-${restaurantId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "waiters", filter: `restaurant_id=eq.${restaurantId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, load, instanceId]);

  async function createWaiter(name: string): Promise<{ ok: boolean; error?: string }> {
    if (!restaurantId) return { ok: false, error: "Restaurante não identificado" };
    const { error } = await supabase.from("waiters").insert({ restaurant_id: restaurantId, name });
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }

  async function setWaiterActive(waiterId: string, active: boolean): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase.from("waiters").update({ active }).eq("id", waiterId);
    if (error) return { ok: false, error: error.message };
    await load();
    return { ok: true };
  }

  return { waiters, loading, createWaiter, setWaiterActive };
}

function storageKey(restaurantId: string) {
  return `sigma-waiter-${restaurantId}`;
}

// Seleção local de "quem está atendendo" — não é autenticação, é só uma
// preferência do dispositivo guardada em localStorage. Valida contra a lista
// carregada no mount e limpa sozinha se o id não existir mais (garçom
// desativado/removido), pra nunca deixar a tela filtrando por um id fantasma.
export function useSelectedWaiter(restaurantId: string | null, waiters: Waiter[]) {
  const [selectedId, setSelectedIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    const stored = window.localStorage.getItem(storageKey(restaurantId));
    setSelectedIdState(stored);
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId || waiters.length === 0 || !selectedId) return;
    if (!waiters.some((w) => w.id === selectedId)) {
      window.localStorage.removeItem(storageKey(restaurantId));
      setSelectedIdState(null);
    }
  }, [restaurantId, waiters, selectedId]);

  function setSelectedId(waiterId: string | null) {
    setSelectedIdState(waiterId);
    if (!restaurantId) return;
    if (waiterId) window.localStorage.setItem(storageKey(restaurantId), waiterId);
    else window.localStorage.removeItem(storageKey(restaurantId));
  }

  return { selectedId, setSelectedId };
}
