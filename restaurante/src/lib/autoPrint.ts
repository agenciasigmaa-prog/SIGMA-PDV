import { useEffect, useId, useRef, useState } from "react";
import { supabase } from "./supabase";
import { fetchOrderById, type OrderType } from "./orders";
import { playOrderSound } from "./orderSound";
import { describeAgentError, getAgentConfig, getExtraPrinterNames, printOrder, probeAgent } from "./printAgent";

/**
 * Som + impressão automática de pedido novo, ativos em qualquer tela do app
 * — não só em /pedidos. Antes vivia dentro da página Pedidos, então só
 * disparava com o board aberto: se o dono estivesse mexendo no Cardápio ou
 * na Dashboard quando um pedido chegasse, nada tocava e nada imprimia.
 * Monta uma vez em RestaurantLayout (fora do <Outlet/>, então sobrevive à
 * troca de rota) e escuta o INSERT em `orders` diretamente, sem depender do
 * board estar carregado.
 */
export function useAutoPrintOnNewOrders(restaurantId: string | null, restaurantName: string) {
  const [printWarning, setPrintWarning] = useState<string | null>(null);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false);
  // Evita fechar sobre um restaurantName desatualizado dentro do listener do
  // realtime, que só é recriado quando restaurantId muda.
  const restaurantNameRef = useRef(restaurantName);
  restaurantNameRef.current = restaurantName;
  // Nome de canal único por instância do hook — sem isso, dois mounts
  // concorrentes (StrictMode em dev fazendo mount→cleanup→mount, ou duas
  // abas do painel abertas ao mesmo tempo) reusam o mesmo `RealtimeChannel`
  // (supabase-js cacheia por tópico) e o pedido novo dispara o print duas
  // vezes seguidas pra UM único INSERT — foi exatamente isso que aconteceu
  // durante os testes desta sessão.
  const instanceId = useId();

  useEffect(() => {
    let cancelled = false;
    async function loadAutoPrintConfig() {
      const health = await probeAgent();
      if (!health || cancelled) return;
      try {
        const cfg = await getAgentConfig();
        if (!cancelled) setAutoPrintEnabled(cfg.autoPrint);
      } catch {
        // Agente respondeu ao /health mas falhou no /config — mantém o
        // valor anterior, não vale travar por isso.
      }
    }
    loadAutoPrintConfig();
    window.addEventListener("focus", loadAutoPrintConfig);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", loadAutoPrintConfig);
    };
  }, []);

  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel(`auto-print-${restaurantId}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
          const row = payload.new as { id: string; order_type: OrderType };
          playOrderSound(row.order_type);

          if (!autoPrintEnabled) return;
          try {
            const order = await fetchOrderById(row.id);
            if (!order) return;
            await printOrder(order, restaurantNameRef.current, getExtraPrinterNames(restaurantId));
          } catch (err) {
            setPrintWarning(`Falha ao imprimir comanda automaticamente: ${describeAgentError(err)}`);
            setTimeout(() => setPrintWarning(null), 8000);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, autoPrintEnabled, instanceId]);

  return { printWarning };
}
