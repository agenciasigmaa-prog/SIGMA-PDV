import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type RestaurantCustomer = { id: string; full_name: string | null; phone: string | null; email: string | null };

// Clientes com conta de verdade que já pediram NESTE restaurante — usado
// pra "linkar" um pedido lançado manualmente (ManualOrderModal) à conta do
// cliente, quando ele liga ou chega no balcão em vez de pedir pelo
// cardápio. A RLS (profiles_select_restaurant_customers) já restringe
// isso sozinha: só enxerga perfil de cliente que tem pelo menos um pedido
// anterior NESTE restaurante — uma conta que só pediu noutro restaurante,
// ou alguém pedindo aqui pela primeira vez, não aparece. Isso é uma
// decisão de privacidade já existente no schema (staff não pode vasculhar
// a base inteira de clientes da plataforma), não uma limitação nova desta
// feature — cliente de primeira viagem fica sem conta vinculada mesmo.
export function useRestaurantCustomers(restaurantId: string | null) {
  const [customers, setCustomers] = useState<RestaurantCustomer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase.from("profiles").select("id, full_name, phone, email").eq("role", "customer").order("full_name");
    setCustomers(data ?? []);
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  return { customers, loading };
}
