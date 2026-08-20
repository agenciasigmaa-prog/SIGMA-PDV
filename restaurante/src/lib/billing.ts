import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { describeFunctionError } from "./functionError";

export type BillingStatus = "unpaid" | "active" | "past_due" | "canceled";

export type RestaurantBilling = {
  status: BillingStatus;
  lastEvent: string | null;
  lastEventAt: string | null;
  paidAt: string | null;
  nextPaymentDate: string | null;
};

// Preço fixo do plano único — não vem do banco (não tem mais de um plano
// hoje), só reflete o valor configurado na oferta da Cakto. Se o preço
// mudar um dia, muda os dois lugares junto (aqui e a oferta no painel deles).
export const PLAN_PRICE_LABEL = "R$ 350,00/mês";

// Status de cobrança do restaurante logado — cakto-webhook é quem escreve
// aqui (nunca o cliente direto, RLS só libera SELECT pra staff/admin, ver
// 0060_restaurant_billing_cakto.sql). Sem linha ainda (nunca gerou um
// checkout) conta como "unpaid" — mesmo default que a linha ganharia se
// existisse, só que sem precisar criar antecipadamente.
export function useRestaurantBilling(restaurantId: string | null) {
  const [billing, setBilling] = useState<RestaurantBilling | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("restaurant_billing")
      .select("status, last_event, last_event_at, paid_at, next_payment_date")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    setBilling({
      status: (data?.status as BillingStatus) ?? "unpaid",
      lastEvent: data?.last_event ?? null,
      lastEventAt: data?.last_event_at ?? null,
      paidAt: data?.paid_at ?? null,
      nextPaymentDate: data?.next_payment_date ?? null,
    });
    setLoading(false);
  }, [restaurantId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime pra tela de Cobrança atualizar sozinha quando o webhook da
  // Cakto confirmar o pagamento — sem isso, o dono precisaria dar F5 depois
  // de pagar pra deixar de ver a tela de bloqueio.
  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel(`restaurant-billing-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "restaurant_billing", filter: `restaurant_id=eq.${restaurantId}` },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, load]);

  return { billing, loading, reload: load };
}

// Pede pra cakto-create-checkout montar o link de pagamento (já
// pré-preenchido com nome/e-mail/telefone do dono logado) e devolve a URL
// pronta pra redirecionar.
export async function createCaktoCheckout(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("cakto-create-checkout");
  if (error) throw new Error(await describeFunctionError(error));
  return data.checkoutUrl as string;
}
