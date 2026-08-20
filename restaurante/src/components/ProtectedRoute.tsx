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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("restaurants")
      .select("status")
      .eq("id", restaurantId)
      .single()
      .then(({ data }) => {
        setStatus(data?.status ?? null);
        setLoading(false);
      });
  }, [restaurantId]);

  return { status, loading };
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
