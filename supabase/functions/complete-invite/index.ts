import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, serializeError } from "../_shared/admin-guard.ts";

// Mesmo algoritmo de generate_restaurant_slug() (migration 0045_restaurant_slug.sql),
// reimplementado aqui porque essa function nunca deixa o Postgres gerar o slug
// sozinho — o dono escolhe o dele na tela de cadastro, só normalizamos o formato.
function slugify(input: string): string {
  const decomposed = input.normalize("NFD");
  let stripped = "";
  for (const ch of decomposed) {
    if (ch.codePointAt(0)! < 0x0300 || ch.codePointAt(0)! > 0x036f) stripped += ch;
  }
  return stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Pública (sem admin): o dono do restaurante chama isso na tela de cadastro pra
// preencher os dados do restaurante (nome, CNPJ, contato, telefone do
// estabelecimento), escolher o link (slug/subdomínio) e o próprio e-mail/senha.
// O user_metadata leva o invite_token, e é o trigger handle_new_user (ver
// migration 0006) que vincula o profile ao restaurante certo numa única
// inserção — os dados do restaurante em si (nome/cnpj/contato/slug) são
// gravados aqui direto, antes de criar a conta, pra validar tudo (principalmente
// a disponibilidade do slug) antes de um auth.users irreversível ser criado.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, email, password, name, cnpj, contact_name, contact_phone, establishment_phone, slug } =
      await req.json();
    if (!token || !email || !password || !name || !contact_name || !slug) {
      return new Response(
        JSON.stringify({ error: "token, email, password, name, contact_name and slug are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const normalizedSlug = slugify(slug);
    if (!normalizedSlug) {
      return new Response(JSON.stringify({ error: "Link inválido — use letras e números." }), {
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

    // Nunca confia na checagem de disponibilidade feita no client (só UX) —
    // revalida aqui, excluindo o próprio restaurante placeholder da comparação.
    const { data: slugTaken, error: slugError } = await serviceClient
      .from("restaurants")
      .select("id")
      .eq("slug", normalizedSlug)
      .neq("id", restaurant.id)
      .maybeSingle();
    if (slugError) throw slugError;
    if (slugTaken) {
      return new Response(JSON.stringify({ error: "Esse link já está em uso — escolha outro." }), {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: updateError } = await serviceClient
      .from("restaurants")
      .update({
        name,
        cnpj: cnpj || null,
        contact_name,
        contact_phone: contact_phone || null,
        establishment_phone: establishment_phone || null,
        slug: normalizedSlug,
      })
      .eq("id", restaurant.id);
    if (updateError) throw updateError;

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
