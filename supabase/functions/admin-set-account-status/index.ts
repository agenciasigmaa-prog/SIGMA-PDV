import { corsHeaders, logAdminAction, requireAdmin, serializeError } from "../_shared/admin-guard.ts";

const VALID_STATUSES = ["onboarding", "active", "suspended", "cancelled"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { admin, serviceClient } = await requireAdmin(req);
    const { restaurant_id, status } = await req.json();

    if (!restaurant_id || !VALID_STATUSES.includes(status)) {
      return new Response(JSON.stringify({ error: "restaurant_id and a valid status are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: restaurant, error } = await serviceClient
      .from("restaurants")
      .update({ status })
      .eq("id", restaurant_id)
      .select()
      .single();

    if (error) throw error;

    await logAdminAction(serviceClient, admin.id, "account_status_changed", restaurant_id, { status });

    return new Response(JSON.stringify({ restaurant }), {
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
