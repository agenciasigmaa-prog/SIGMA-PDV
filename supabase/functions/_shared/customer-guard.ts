import { createClient, type User } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "./admin-guard.ts";

/**
 * Verifies the caller has a valid session (any authenticated user — no role
 * check, dine-in ordering isn't restricted to the 'customer' role), then
 * returns a service-role client for the privileged writes (table_sessions is
 * staff/admin-only via RLS; this function validates everything itself before
 * touching it). Throws a Response to be returned as-is on failure.
 */
export async function requireCustomer(req: Request): Promise<{ user: User; serviceClient: ReturnType<typeof createClient> }> {
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

  return { user, serviceClient };
}
