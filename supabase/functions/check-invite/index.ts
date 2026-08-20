import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/admin-guard.ts";

// Pública (sem admin): a tela de cadastro do dono chama isso antes de mostrar o
// formulário, pra saber se o token do link ainda é válido. Só devolve um boolean —
// nunca dados do restaurante — pra não vazar nada pra quem não tem o link.
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
      .from("restaurants")
      .select("id")
      .eq("invite_token", token)
      .maybeSingle();

    return new Response(JSON.stringify({ valid: !!data, restaurantId: data?.id ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ valid: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
