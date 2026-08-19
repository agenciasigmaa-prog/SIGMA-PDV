import { corsHeaders, serializeError } from "../_shared/admin-guard.ts";
import { requireRestaurantStaff } from "../_shared/customer-guard.ts";

type BusinessHourInput = {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  closed: boolean;
};

type RequestBody = {
  action?: "set_ordering_enabled" | "set_business_hours";
  ordering_enabled?: boolean;
  hours?: BusinessHourInput[];
};

// O dono não tem UPDATE direto em restaurants (restaurants_update é
// admin-only, 0002_harden_rls.sql) — de propósito, pra não poder mexer em
// campos que são da agência (ex. status da conta). Essa function só toca
// ordering_enabled/business_hours, sempre restrito ao restaurant_id do
// próprio staff logado (nunca confia em restaurant_id vindo do client).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { serviceClient, restaurantId } = await requireRestaurantStaff(req);
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    if (body.action === "set_ordering_enabled") {
      const enabled = Boolean(body.ordering_enabled);
      const { error } = await serviceClient.from("restaurants").update({ ordering_enabled: enabled }).eq("id", restaurantId);
      if (error) throw error;
      return new Response(JSON.stringify({ ok: true, ordering_enabled: enabled }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (body.action === "set_business_hours") {
      const hours = Array.isArray(body.hours) ? body.hours : [];
      const validDays = new Set([0, 1, 2, 3, 4, 5, 6]);
      const rows = hours
        .filter((h) => validDays.has(Number(h.day_of_week)))
        .map((h) => ({
          restaurant_id: restaurantId,
          day_of_week: Number(h.day_of_week),
          opens_at: h.closed ? null : h.opens_at || null,
          closes_at: h.closed ? null : h.closes_at || null,
          closed: Boolean(h.closed),
        }));

      // Substitui tudo de uma vez (mesmo padrão de saveProductIngredients em
      // restaurante/src/lib/ingredients.ts) — mais simples que diff por dia.
      const { error: deleteError } = await serviceClient.from("business_hours").delete().eq("restaurant_id", restaurantId);
      if (deleteError) throw deleteError;
      if (rows.length > 0) {
        const { error: insertError } = await serviceClient.from("business_hours").insert(rows);
        if (insertError) throw insertError;
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
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
