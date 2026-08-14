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
    if (!supabaseUrl || !anonKey || !serviceKey || !authHeader) {
      return json({ error: "Unauthorized." }, 401);
    }

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

    let workspaceId: string | null = null;

    if (ownedWorkspace) {
      workspaceId = String(ownedWorkspace.id);
      const [
        { count: memberCount, error: memberError },
        { data: subscription, error: subscriptionError },
        { data: billingAccount, error: billingAccountError },
      ] = await Promise.all([
        service
          .from("workspace_members")
          .select("user_id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId),
        service
          .from("subscriptions")
          .select("status, stripe_customer_id, stripe_subscription_id, cancel_at_period_end, current_period_end")
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        service
          .from("billing_accounts")
          .select("id, workspace_id, workspace_reference, stripe_customer_id, latest_stripe_subscription_id, account_deleted_at")
          .eq("workspace_reference", workspaceId)
          .maybeSingle(),
      ]);

      if (memberError) throw memberError;
      if (subscriptionError) throw subscriptionError;
      if (billingAccountError) throw billingAccountError;

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

      // v3 must never run without the seller-side archive migration. Even a workspace that
      // never paid receives a billing_accounts row at workspace creation, so absence means
      // the retention-safe schema is not ready and deletion must fail closed.
      if (!billingAccount?.id || billingAccount.workspace_id !== workspaceId) {
        return json({
          ok: false,
          error: "Account deletion is temporarily unavailable while billing-retention safeguards are being synchronized.",
          code: "billing_archive_not_ready",
        }, 503);
      }

      // For a workspace that ever had Stripe billing, verify that the durable archive already
      // carries the same routing identifiers before the deletable subscriptions row disappears.
      if (subscription?.stripe_customer_id && billingAccount.stripe_customer_id !== subscription.stripe_customer_id) {
        return json({
          ok: false,
          error: "Billing archive is not synchronized with the Stripe customer yet.",
          code: "billing_archive_not_synced",
        }, 409);
      }
      if (
        subscription?.stripe_subscription_id &&
        billingAccount.latest_stripe_subscription_id !== subscription.stripe_subscription_id
      ) {
        return json({
          ok: false,
          error: "Billing archive is not synchronized with the Stripe subscription yet.",
          code: "billing_archive_not_synced",
        }, 409);
      }
    }

    const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    if (workspaceId) {
      // The workspace is removed by the existing Auth->workspace cascade. The archive migration's
      // BEFORE DELETE trigger must detach, not delete, the seller-side billing account.
      const { data: retained, error: retainedError } = await service
        .from("billing_accounts")
        .select("id, workspace_id, workspace_reference, account_deleted_at")
        .eq("workspace_reference", workspaceId)
        .maybeSingle();
      if (retainedError) throw retainedError;

      if (!retained?.id || retained.workspace_id !== null || !retained.account_deleted_at) {
        console.error("Account was deleted but billing archive verification failed", {
          workspace_reference: workspaceId,
          archive_found: Boolean(retained?.id),
          detached: retained?.workspace_id === null,
          deletion_timestamped: Boolean(retained?.account_deleted_at),
        });
        return json({
          ok: true,
          warning: "Account deleted. Billing archive requires operator review.",
          code: "billing_archive_review_required",
        });
      }
    }

    return json({ ok: true, billing_records_retained_as_required: true });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error." }, 500);
  }
});
