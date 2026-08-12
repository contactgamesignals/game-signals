import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = request.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceKey || !authHeader) return json({ error: "Unauthorized." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    const user = authData.user;
    if (authError || !user) return json({ error: "Unauthorized." }, 401);

    const body = await request.json().catch(() => ({})) as { confirmation?: string };
    if (body.confirmation !== "DELETE") {
      return json({ ok: false, error: "Type DELETE to confirm account deletion." });
    }

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: ownedWorkspace, error: workspaceError } = await service
      .from("workspaces")
      .select("id")
      .eq("owner_id", user.id)
      .limit(1)
      .maybeSingle();
    if (workspaceError) throw workspaceError;

    if (ownedWorkspace) {
      const [{ count: memberCount, error: memberError }, { data: subscription, error: subscriptionError }] = await Promise.all([
        service
          .from("workspace_members")
          .select("user_id", { count: "exact", head: true })
          .eq("workspace_id", ownedWorkspace.id),
        service
          .from("subscriptions")
          .select("status, stripe_subscription_id, cancel_at_period_end, current_period_end")
          .eq("workspace_id", ownedWorkspace.id)
          .maybeSingle(),
      ]);
      if (memberError) throw memberError;
      if (subscriptionError) throw subscriptionError;

      if ((memberCount ?? 0) > 1) {
        return json({
          ok: false,
          error: "This workspace has other members. Remove or transfer them before deleting the owner account.",
          code: "workspace_has_members",
        });
      }

      if (subscription?.stripe_subscription_id && subscription.status !== "canceled") {
        return json({
          ok: false,
          error: subscription.cancel_at_period_end
            ? "Your paid subscription is scheduled to end. Delete the account after the paid period finishes."
            : "Cancel the paid subscription in Stripe Customer Portal before deleting the account.",
          code: "active_subscription",
          requires_billing_portal: true,
          current_period_end: subscription.current_period_end,
        });
      }
    }

    const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});
