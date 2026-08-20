import { useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { useSession } from "../lib/useSession";
import { createCaktoCheckout, PLAN_PRICE_LABEL, useRestaurantBilling, type BillingStatus } from "../lib/billing";

const STATUS_LABEL: Record<BillingStatus, { label: string; className: string }> = {
  unpaid: { label: "Sem pagamento ainda", className: "bg-muted text-muted-foreground" },
  active: { label: "Em dia", className: "bg-success/10 text-success" },
  past_due: { label: "Pagamento pendente", className: "bg-amber-100 text-amber-900" },
  canceled: { label: "Cancelado", className: "bg-destructive/10 text-destructive" },
};

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

// Tela de cobrança — plano único (ver lib/billing.ts, PLAN_PRICE_LABEL) via
// Cakto. ProtectedRoute.tsx redireciona pra cá sozinho quando
// restaurants.status não é 'active', então essa tela também funciona como
// bloqueio: só sai daqui de volta pro resto do painel depois que o webhook
// da Cakto confirmar o pagamento (o useRestaurantBilling é realtime, então
// isso acontece sozinho, sem precisar recarregar a página).
export function Cobranca() {
  const { profile } = useSession();
  const restaurantId = profile?.restaurant_id ?? null;
  const { billing, loading } = useRestaurantBilling(restaurantId);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePagar() {
    setRedirecting(true);
    setError(null);
    try {
      const url = await createCaktoCheckout();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu pra gerar o link de pagamento. Tenta de novo.");
      setRedirecting(false);
    }
  }

  if (loading || !billing) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  const isActive = billing.status === "active";
  const statusInfo = STATUS_LABEL[billing.status];

  return (
    <div className="mx-auto max-w-lg">
      <h2 className="text-xl font-bold">Cobrança</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {isActive
          ? "Sua assinatura está ativa — obrigado por usar o Cardápio SIG."
          : "Assine o plano único pra liberar o acesso ao painel do restaurante."}
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <CreditCard className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-bold">Plano único</p>
              <p className="text-xs text-muted-foreground">Acesso completo ao painel</p>
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusInfo.className}`}>{statusInfo.label}</span>
        </div>

        <p className="mt-4 text-2xl font-black">{PLAN_PRICE_LABEL}</p>

        {billing.paidAt && (
          <p className="mt-2 text-xs text-muted-foreground">Último pagamento confirmado em {dateLabel(billing.paidAt)}.</p>
        )}
        {billing.nextPaymentDate && isActive && (
          <p className="text-xs text-muted-foreground">Próxima cobrança em {dateLabel(billing.nextPaymentDate)}.</p>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        {isActive ? (
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Assinatura ativa
          </div>
        ) : (
          <button
            onClick={handlePagar}
            disabled={redirecting}
            className="press mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {redirecting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Abrindo pagamento...
              </>
            ) : (
              "Pagar agora"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
