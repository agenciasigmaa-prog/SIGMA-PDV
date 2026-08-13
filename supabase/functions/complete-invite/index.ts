import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, serializeError } from "../_shared/admin-guard.ts";

// Pública (sem admin): o dono do restaurante chama isso na tela de cadastro pra
// escolher o próprio e-mail/senha. O user_metadata leva o invite_token, e é o
// trigger handle_new_user (ver migration 0006) que vincula o profile ao restaurante
// certo numa única inserção — essa function não toca em profiles/restaurants além
// de validar o token antes de criar a conta.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, email, password } = await req.json();
    if (!token || !email || !password) {
      return new Response(JSON.stringify({ error: "token, email and password are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: restaurant, error: restaurantError } = await serviceClient
      .from("restaurants")
      .select("id")
      .eq("invite_token", token)
      .maybeSingle();
    if (restaurantError) throw restaurantError;

    if (!restaurant) {
      return new Response(JSON.stringify({ error: "Link inválido ou expirado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { invite_token: token },
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
