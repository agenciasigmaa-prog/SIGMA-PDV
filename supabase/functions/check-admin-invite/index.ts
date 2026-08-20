import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/admin-guard.ts";

// Pública (sem admin): a tela /aceitar-convite chama isso antes de mostrar o
// formulário, pra saber se o token ainda é válido (existe, não foi usado, não
// expirou). Só devolve um boolean — nunca quem criou o convite.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token) {
      return new Response(JSON.stringify({ valid: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data } = await serviceClient
      .from("admin_invites")
      .select("id")
      .eq("token", token)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    return new Response(JSON.stringify({ valid: !!data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
