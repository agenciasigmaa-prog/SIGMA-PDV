import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/useSession";

// Bloqueia o painel pra restaurante sem assinatura ativa (restaurants.status
// != 'active') — cakto-webhook é quem muda esse status (ver
// 0060_restaurant_billing_cakto.sql e lib/billing.ts). Rodava só na tela de
// Cobrança até aqui (fetch dedicado, não pelo useSession — status não é do
// profile do usuário, é do restaurante). /cobranca fica de fora do bloqueio
// de propósito, senão o dono nunca conseguiria chegar lá pra pagar.
function useRestaurantStatus(restaurantId: string | null) {
  const [status, setStatus] = useState<string | null>(null);
  const [freeTrialUntil, setFreeTrialUntil] = useState<string | null>(null);
  // `loading` é DERIVADO comparando restaurantId (o pedido atual) com
  // fetchedFor (pra qual id a última busca terminou) — não um state próprio
  // atualizado só dentro do useEffect. Com state próprio, havia uma corrida
  // real: profile carrega, restaurantId vira um id de verdade, mas nesse
  // MESMO render o `loading` ainda estava com o valor antigo (false, de
  // quando restaurantId era null) porque o useEffect que botaria loading de
  // volta em true só roda DEPOIS do render commitar. Nesse intervalo,
  // ProtectedRoute lia status=null como "carregado, não tá active" e
  // redirecionava pra /cobranca — mesmo pra restaurante liberado — toda vez
  // que a página recarregava do zero.
  const [fetchedFor, setFetchedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    supabase
      .from("restaurants")
      .select("status, free_trial_until")
      .eq("id", restaurantId)
      .single()
      .then(({ data }) => {
        if (cancelled) return;
        setStatus(data?.status ?? null);
        setFreeTrialUntil(data?.free_trial_until ?? null);
        setFetchedFor(restaurantId);
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const loading = restaurantId !== null && fetchedFor !== restaurantId;
  // "Primeiro mês grátis" (ver 0061_restaurant_free_trial.sql): o
  // restaurante nasce com status 'active' sem pagar nada, mas só até
  // free_trial_until — passado esse prazo, tratamos como se não estivesse
  // mais active (mesmo o campo status ainda dizendo 'active' no banco,
  // porque nada troca ele automaticamente na expiração — é reavaliado aqui
  // toda vez, sem precisar de job/cron). Some sozinho se um pagamento real
  // chegar antes: cakto-webhook zera free_trial_until nesse caso.
  const trialExpired = !!freeTrialUntil && new Date(freeTrialUntil) < new Date();
  const effectiveStatus = status === "active" && trialExpired ? "trial_expired" : status;
  return { status: effectiveStatus, loading };
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useSession();
  const { status: restaurantStatus, loading: statusLoading } = useRestaurantStatus(profile?.restaurant_id ?? null);
  const location = useLocation();

  if (loading || (profile && statusLoading)) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Carregando...</div>;
  }

  if (!session) return <Navigate to="/login" replace />;

  if (profile && !["restaurant_owner", "restaurant_staff"].includes(profile.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <p className="mb-2 text-lg font-semibold">Acesso não autorizado</p>
          <p className="text-sm text-muted-foreground">Esta conta não tem acesso à área do restaurante.</p>
        </div>
      </div>
    );
  }

  if (
    profile &&
    restaurantStatus !== "active" &&
    location.pathname !== "/cobranca" &&
    location.pathname !== "/bem-vindo"
  ) {
    return <Navigate to="/cobranca" replace />;
  }

  return <>{children}</>;
}
