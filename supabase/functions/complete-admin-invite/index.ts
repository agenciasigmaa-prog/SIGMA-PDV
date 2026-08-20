import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, serializeError } from "../_shared/admin-guard.ts";

// Pública (sem admin — a validade do token é a própria autorização): conclui um
// convite de admin de dois jeitos possíveis, escolhido explicitamente pelo
// client via `mode`:
//
// 1) mode !== "oauth", com email/password no body — cria a conta na hora
//    (auth.admin.createUser com admin_invite_token no metadata; o trigger
//    handle_new_user, ver 0055_admin_invites.sql, vira o profile pra 'admin').
// 2) mode === "oauth" — usado quando o convite é aceito via "Continuar com
//    Google": nesse caso o handle_new_user já rodou SEM o token
//    (signInWithOAuth não permite mandar user_metadata customizado), então
//    aqui validamos a sessão ativa e promovemos o profile já existente pra
//    'admin' diretamente (a não ser que já esteja vinculado a um restaurante).
//
// Em ambos os casos o convite é marcado como usado (used_at), ficando inativo
// pra sempre — nunca reutilizável, mesmo dentro da janela de 10 minutos.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { token, mode } = body;
    if (!token) {
      return new Response(JSON.stringify({ error: "token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: invite, error: inviteError } = await serviceClient
      .from("admin_invites")
      .select("id")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (inviteError) throw inviteError;

    if (!invite) {
      return new Response(JSON.stringify({ error: "Link inválido ou expirado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "oauth") {
      // Caminho Google: usuário já autenticado (supabase-js manda o token da sessão
      // ativa como Authorization automaticamente), só falta promover o profile. Não
      // dá pra distinguir isso só pela presença do header — supabase-js sempre manda
      // um Authorization (cai pra anon key sem sessão) — por isso o modo é explícito.
      const authHeader = req.headers.get("Authorization");
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader ?? "" } } },
      );
      const { data: { user }, error: userError } = await anonClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Sessão inválida" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Nunca promove uma conta já vinculada a um restaurante — isso forçaria
      // restaurant_id pra null (constraint staff_requires_restaurant) e
      // desligaria o dono/staff do restaurante dele sem querer.
      const { data: existingProfile, error: existingProfileError } = await serviceClient
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (existingProfileError) throw existingProfileError;
      if (["restaurant_owner", "restaurant_staff"].includes(existingProfile.role)) {
        return new Response(
          JSON.stringify({ error: "Essa conta Google já está vinculada a um restaurante — use outra conta." }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { error: updateError } = await serviceClient
        .from("profiles")
        .update({ role: "admin", restaurant_id: null })
        .eq("id", user.id);
      if (updateError) throw updateError;

      const { error: markUsedError } = await serviceClient
        .from("admin_invites")
        .update({ used_at: new Date().toISOString(), used_by: user.id })
        .eq("id", invite.id);
      if (markUsedError) throw markUsedError;

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Caminho e-mail/senha: cria a conta agora, o trigger cuida do resto.
    const { email, password } = body;
    if (!email || !password) {
      return new Response(JSON.stringify({ error: "email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { admin_invite_token: token },
    });
    if (createError) throw createError;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: serializeError(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
