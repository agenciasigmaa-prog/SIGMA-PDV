import { createClient, type User } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Verifies the caller is an authenticated admin, then returns a service-role
 * client for privileged operations. Throws a Response to be returned as-is
 * on failure.
 */
export async function requireAdmin(req: Request): Promise<{ admin: User; serviceClient: ReturnType<typeof createClient> }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anonClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: { user }, error: userError } = await anonClient.auth.getUser();
  if (userError || !user) {
    throw new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return { admin: user, serviceClient };
}

export function serializeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export async function logAdminAction(
  serviceClient: ReturnType<typeof createClient>,
  adminId: string,
  action: string,
  targetRestaurantId: string | null,
  details: Record<string, unknown>,
) {
  await serviceClient.from("admin_action_log").insert({
    admin_id: adminId,
    target_restaurant_id: targetRestaurantId,
    action,
    details,
  });
}
