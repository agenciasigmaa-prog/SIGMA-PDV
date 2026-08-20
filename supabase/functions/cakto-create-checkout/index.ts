import { corsHeaders } from "../_shared/admin-guard.ts";
import { requireRestaurantStaff } from "../_shared/customer-guard.ts";

// Link de checkout da Cakto pro plano único (R$350/mês, assinatura
// recorrente) — ver CLAUDE.md, seção "Cobrança (Cakto)". A oferta em si
// (preço, recorrência) já existe do lado da Cakto (produto "cadapio sig",
// oferta padrão), criada uma vez no painel deles — esta function só monta a
// URL de checkout PRÉ-PREENCHIDA com os dados do dono logado e, mais
// importante, com `sck=<restaurant_id>` na query string: a Cakto ecoa esse
// parâmetro de volta em `data.sck` no payload do webhook de pagamento, o que
// deixa saber qual restaurante pagou sem depender só de casar e-mail (vários
// restaurantes pagam contra a MESMA oferta compartilhada, não uma por
// tenant, então precisa de algo que correlacione de volta com segurança).
const CAKTO_OFFER_ID = "3edmmmm";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, serviceClient, restaurantId } = await requireRestaurantStaff(req);

    const { data: profile } = await serviceClient
      .from("profiles")
      .select("full_name, email, phone")
      .eq("id", user.id)
      .single();

    // Garante que existe uma linha de cobrança pro restaurante (status
    // 'unpaid' por padrão) antes de mandar pro checkout, pra tela de
    // Cobrança já ter o que mostrar mesmo antes do primeiro pagamento.
    await serviceClient
      .from("restaurant_billing")
      .upsert({ restaurant_id: restaurantId }, { onConflict: "restaurant_id", ignoreDuplicates: true });

    const params = new URLSearchParams({ sck: restaurantId });
    if (profile?.full_name) params.set("name", profile.full_name);
    if (profile?.email) {
      params.set("email", profile.email);
      params.set("confirmEmail", profile.email);
    }
    if (profile?.phone) params.set("phone", profile.phone.replace(/\D/g, ""));

    const checkoutUrl = `https://pay.cakto.com.br/${CAKTO_OFFER_ID}?${params.toString()}`;

    return new Response(JSON.stringify({ checkoutUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
