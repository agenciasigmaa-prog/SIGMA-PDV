import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/admin-guard.ts";

// Recebe eventos de pagamento da Cakto pro plano único de cobrança — ver
// CLAUDE.md, seção "Cobrança (Cakto)". Pública de propósito (a Cakto não
// manda JWT do Supabase, é um servidor terceiro chamando direto) — a
// autenticidade não vem de header nenhum, vem de um campo `secret` dentro do
// próprio corpo do POST que a Cakto manda (documentado assim pela Cakto:
// "não assina o payload com HMAC nem envia header de assinatura"), que
// precisa bater com o secret gerado na hora que o webhook foi cadastrado no
// painel deles (guardado aqui como CAKTO_WEBHOOK_SECRET). Comparação em
// tempo constante pra não abrir brecha de timing attack.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

// Eventos que contam como "assinatura em dia" — libera o restaurante.
const ACTIVE_EVENTS = new Set(["purchase_approved", "subscription_created", "subscription_renewed", "subscription_resumed"]);
// Eventos definitivos de perda de acesso — suspende o restaurante (não
// mexe em restaurants.status pra 'cancelled': esse valor fica reservado pra
// ação manual do admin, ver CLAUDE.md).
const SUSPEND_EVENTS = new Set(["subscription_canceled", "chargeback", "refund"]);
// Eventos de "atenção, mas ainda não é definitivo" (a Cakto ainda vai tentar
// cobrar de novo, ver retry_interval/max_retries da oferta) — só registra no
// histórico de cobrança, não mexe no acesso do restaurante ainda.
const WARNING_EVENTS = new Set(["purchase_refused", "subscription_renewal_refused", "subscription_paused"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const expectedSecret = Deno.env.get("CAKTO_WEBHOOK_SECRET");
  if (!expectedSecret) {
    // Secret não configurado ainda (passo manual pendente, ver
    // CLAUDE.md/README) — recusa tudo em vez de aceitar sem checar nada.
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.secret !== "string" || !timingSafeEqual(body.secret, expectedSecret)) {
    return new Response(JSON.stringify({ error: "Invalid secret" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const event = body.event as string | undefined;
  const data = body.data ?? {};
  // sck é o parâmetro que cakto-create-checkout coloca na URL do checkout
  // (= restaurant_id) e a Cakto ecoa de volta aqui — é a correlação
  // primária, já que várias contas de restaurante pagam contra a MESMA
  // oferta compartilhada (não uma oferta por tenant). E-mail do cliente
  // entra só como reforço/depuração caso sck venha vazio (checkout aberto
  // sem passar pela cakto-create-checkout, ex. link copiado à mão).
  let restaurantId: string | null = data.sck || null;

  const serviceClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!restaurantId && data.customer?.email) {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("restaurant_id")
      .eq("email", data.customer.email)
      .not("restaurant_id", "is", null)
      .maybeSingle();
    restaurantId = profile?.restaurant_id ?? null;
  }

  if (!restaurantId || !event) {
    return new Response(JSON.stringify({ error: "Missing restaurant reference or event" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const now = new Date().toISOString();
  const billingPatch: Record<string, unknown> = {
    restaurant_id: restaurantId,
    last_event: event,
    last_event_at: now,
    updated_at: now,
    ...(data.id ? { cakto_order_id: String(data.id) } : {}),
    ...(data.subscription?.id ? { cakto_subscription_id: String(data.subscription.id) } : {}),
    ...(data.subscription?.next_payment_date ? { next_payment_date: data.subscription.next_payment_date } : {}),
  };

  if (ACTIVE_EVENTS.has(event)) {
    billingPatch.status = "active";
    billingPatch.paid_at = now;
  } else if (SUSPEND_EVENTS.has(event)) {
    billingPatch.status = "canceled";
  } else if (WARNING_EVENTS.has(event)) {
    billingPatch.status = "past_due";
  }

  await serviceClient.from("restaurant_billing").upsert(billingPatch, { onConflict: "restaurant_id" });

  // restaurants.status (account_status, já usado pelo admin) só muda nos
  // casos definitivos — eventos de aviso (past_due) deixam o acesso como
  // está até a Cakto esgotar as tentativas de retry ou o cliente cancelar
  // de fato, pra não suspender o restaurante numa falha de cobrança isolada.
  if (ACTIVE_EVENTS.has(event)) {
    // free_trial_until zerado junto: pagamento real chegou, o restaurante
    // "formou" do trial pra assinante de verdade — sem isso, um restaurante
    // que pagou DURANTE o primeiro mês grátis ficaria bloqueado do nada
    // quando o prazo do trial vencesse, mesmo já pagando (ver
    // 0061_restaurant_free_trial.sql e ProtectedRoute.tsx).
    await serviceClient.from("restaurants").update({ status: "active", free_trial_until: null }).eq("id", restaurantId);
  } else if (SUSPEND_EVENTS.has(event)) {
    await serviceClient.from("restaurants").update({ status: "suspended" }).eq("id", restaurantId);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
