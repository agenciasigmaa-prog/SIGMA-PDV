import { corsHeaders, logAdminAction, requireAdmin, serializeError } from "../_shared/admin-guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { admin, serviceClient } = await requireAdmin(req);
    const { user_id, email, restaurant_id } = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ error: "email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TODO: assim que o SMTP do projeto estiver configurado, trocar por um fluxo
    // que efetivamente envia o link gerado ao usuário (hoje generateLink só retorna o link).
    const { data, error } = await serviceClient.auth.admin.generateLink({
      type: "recovery",
      email,
    });
    if (error) throw error;

    await logAdminAction(serviceClient, admin.id, "password_reset", restaurant_id ?? null, { user_id, email });

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
