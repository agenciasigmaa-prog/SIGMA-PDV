import { corsHeaders, requireAdmin, serializeError } from "../_shared/admin-guard.ts";

const ADMIN_APP_URL = Deno.env.get("ADMIN_APP_URL") ?? "https://adm.assessoriasigma.com.br";

// Admin-only: gera um convite temporário (10 minutos) e de uso único pra criar
// outra conta de admin. Nada de allowlist de e-mail — a posse do link é a prova
// de autorização, igual ao convite de dono de restaurante (admin-create-restaurant).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { admin, serviceClient } = await requireAdmin(req);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const { data: invite, error: insertError } = await serviceClient
      .from("admin_invites")
      .insert({ created_by: admin.id, expires_at: expiresAt })
      .select("token, expires_at")
      .single();
    if (insertError) throw insertError;

    const inviteLink = `${ADMIN_APP_URL}/aceitar-convite?token=${invite.token}`;

    return new Response(JSON.stringify({ invite_link: inviteLink, expires_at: invite.expires_at }), {
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
