import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export type CustomerAddress = { id: string; label: string | null; address_text: string };

// Endereços do próprio cliente logado (RLS: customer_addresses_own, cada um
// só vê/mexe no que é seu) — reaproveitável em qualquer restaurante, já que
// não carrega bairro/taxa (isso é escolhido de novo a cada checkout, por
// restaurante). Vazio pra quem ainda não tem sessão real — nesse caso o
// checkout de delivery só oferece o campo de endereço novo.
export function useCustomerAddresses() {
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: session } = await supabase.auth.getSession();
    if (!session.session || session.session.user.is_anonymous) {
      setAddresses([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("customer_addresses")
      .select("id, label, address_text")
      .order("created_at", { ascending: false });
    setAddresses((data as CustomerAddress[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Chamado depois que o pedido é confirmado com um endereço novo digitado —
  // fica salvo pra próxima vez, sem precisar de uma tela separada de
  // "gerenciar endereços".
  async function saveAddress(addressText: string): Promise<void> {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return;
    const trimmed = addressText.trim();
    if (!trimmed) return;
    const alreadySaved = addresses.some((a) => a.address_text.trim().toLowerCase() === trimmed.toLowerCase());
    if (alreadySaved) return;
    await supabase.from("customer_addresses").insert({ customer_id: session.session.user.id, address_text: trimmed });
  }

  return { addresses, loading, reload: load, saveAddress };
}
