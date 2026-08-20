import { corsHeaders, logAdminAction, requireAdmin, serializeError } from "../_shared/admin-guard.ts";

// "Entrar como suporte" — abre o painel do restaurante já logado como o
// dono, sem precisar da senha dele. Usa auth.admin.generateLink (magiclink),
// não uma senha temporária nem um token nosso: o link já vem assinado pelo
// Supabase, é de uso único e expira sozinho — mesma abordagem já usada em
// admin-reset-password (lá com type: "recovery"). Toda chamada fica
// registrada em admin_action_log (action: "restaurant_impersonated") com o
// e-mail do dono, pra ter rastro de quando um admin acessou a conta de um
// cliente.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { admin, serviceClient } = await requireAdmin(req);
    const { restaurant_id } = await req.json();

    if (!restaurant_id) {
      return new Response(JSON.stringify({ error: "restaurant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ownerProfile, error: ownerError } = await serviceClient
      .from("profiles")
      .select("id")
      .eq("restaurant_id", restaurant_id)
      .eq("role", "restaurant_owner")
      .maybeSingle();
    if (ownerError) throw ownerError;

    if (!ownerProfile) {
      return new Response(
        JSON.stringify({ error: "Nenhum dono vinculado a este restaurante — o convite pode não ter sido concluído ainda." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(ownerProfile.id);
    if (userError) throw userError;
    const email = userData.user.email;
    if (!email) throw new Error("Dono sem e-mail cadastrado.");

    const restauranteAppUrl = Deno.env.get("RESTAURANTE_APP_URL") ?? "https://app.assessoriasigma.com.br";
    const { data, error } = await serviceClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${restauranteAppUrl}/dashboard` },
    });
    if (error) throw error;

    await logAdminAction(serviceClient, admin.id, "restaurant_impersonated", restaurant_id, { owner_email: email });

    return new Response(JSON.stringify({ action_link: data.properties.action_link }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    return new Response(JSON.stringify({ error: serializeError(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
