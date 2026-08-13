import { corsHeaders, logAdminAction, requireAdmin, serializeError } from "../_shared/admin-guard.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { admin, serviceClient } = await requireAdmin(req);
    const body = await req.json();
    const { action, restaurant_id, email, password, full_name, phone } = body;

    if (!restaurant_id) {
      return new Response(JSON.stringify({ error: "restaurant_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ownerProfile, error: ownerError } = await serviceClient
      .from("profiles")
      .select("id, full_name, phone")
      .eq("restaurant_id", restaurant_id)
      .eq("role", "restaurant_owner")
      .maybeSingle();
    if (ownerError) throw ownerError;

    if (!ownerProfile) {
      return new Response(
        JSON.stringify({
          error: "Nenhum dono vinculado a este restaurante — o convite pode ter falhado na criação. Exclua e recrie o restaurante.",
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "get_owner") {
      const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(ownerProfile.id);
      if (userError) throw userError;

      return new Response(
        JSON.stringify({
          user_id: ownerProfile.id,
          email: userData.user.email,
          full_name: ownerProfile.full_name,
          phone: ownerProfile.phone,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "update_owner") {
      const authUpdate: Record<string, string> = {};
      if (email) authUpdate.email = email;
      if (password) authUpdate.password = password;

      if (Object.keys(authUpdate).length > 0) {
        const { error: authError } = await serviceClient.auth.admin.updateUserById(ownerProfile.id, authUpdate);
        if (authError) throw authError;
      }

      const profileUpdate: Record<string, string> = {};
      if (full_name !== undefined) profileUpdate.full_name = full_name;
      if (phone !== undefined) profileUpdate.phone = phone;

      if (Object.keys(profileUpdate).length > 0) {
        const { error: profileError } = await serviceClient.from("profiles").update(profileUpdate).eq("id", ownerProfile.id);
        if (profileError) throw profileError;
      }

      await logAdminAction(serviceClient, admin.id, "owner_account_updated", restaurant_id, {
        changed_fields: [
          ...(email ? ["email"] : []),
          ...(password ? ["password"] : []),
          ...(full_name !== undefined ? ["full_name"] : []),
          ...(phone !== undefined ? ["phone"] : []),
        ],
      });

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
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
