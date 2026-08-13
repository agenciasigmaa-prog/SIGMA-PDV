import { corsHeaders, logAdminAction, requireAdmin, serializeError } from "../_shared/admin-guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { admin, serviceClient } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const { name, contact_name, contact_email, contact_phone, owner_email, owner_password } = body;

    if (owner_password) {
      // Modo manual: ADM já define e-mail/senha na hora, sem link — cria o auth.users
      // direto (dispara o trigger que cria o profile 'customer') e confirma o e-mail.
      if (!name || !owner_email) {
        return new Response(JSON.stringify({ error: "name and owner_email are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: restaurant, error: restaurantError } = await serviceClient
        .from("restaurants")
        .insert({ name, contact_name, contact_email, contact_phone, status: "onboarding" })
        .select()
        .single();
      if (restaurantError) throw restaurantError;

      const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
        email: owner_email,
        password: owner_password,
        email_confirm: true,
      });
      if (createError) throw createError;

      const { error: profileError } = await serviceClient
        .from("profiles")
        .update({ role: "restaurant_owner", restaurant_id: restaurant.id })
        .eq("id", created.user.id);
      if (profileError) throw profileError;

      // Log de auditoria não bloqueia a resposta — o ADM não precisa esperar por isso.
      // EdgeRuntime.waitUntil mantém a function viva até o insert terminar mesmo depois
      // da resposta já ter sido enviada.
      EdgeRuntime.waitUntil(
        logAdminAction(serviceClient, admin.id, "restaurant_created", restaurant.id, {
          name,
          owner_email,
          mode: "manual",
        }),
      );

      return new Response(JSON.stringify({ restaurant }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo convite: ADM só clica, sem preencher nada. Cria um restaurante placeholder
    // com invite_token e devolve o link na hora — o dono escolhe o próprio e-mail e
    // senha ao abrir (via complete-invite) e edita nome/contato depois no painel dele.
    const inviteToken = crypto.randomUUID();
    const { data: restaurant, error: restaurantError } = await serviceClient
      .from("restaurants")
      .insert({ name: "Novo restaurante", status: "onboarding", invite_token: inviteToken })
      .select()
      .single();
    if (restaurantError) throw restaurantError;

    EdgeRuntime.waitUntil(logAdminAction(serviceClient, admin.id, "restaurant_invite_created", restaurant.id, {}));

    // TODO: trocar por variável de ambiente quando o app restaurante for pra produção.
    const inviteLink = `http://localhost:5175/cadastro?token=${inviteToken}`;

    return new Response(JSON.stringify({ restaurant, invite_link: inviteLink }), {
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
