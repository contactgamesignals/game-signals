import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("GAMESIGNAL_SITE_URL") ?? "https://game-signals.vercel.app";

const lookupKeys = {
  indie: { monthly: "gamesignal_indie_monthly", yearly: "gamesignal_indie_yearly" },
  studio: { monthly: "gamesignal_studio_monthly", yearly: "gamesignal_studio_yearly" },
  publisher: { monthly: "gamesignal_publisher_monthly", yearly: "gamesignal_publisher_yearly" },
} as const;

type PaidPlan = keyof typeof lookupKeys;
type Period = "monthly" | "yearly";
type StripeObject = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "indie" || value === "studio" || value === "publisher";
}

function isPeriod(value: unknown): value is Period {
  return value === "monthly" || value === "yearly";
}

async function stripeRequest(path: string, options: { method?: "GET" | "POST"; body?: URLSearchParams } = {}) {
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("Stripe secret is not configured.");

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: options.body,
  });
  const payload = await response.json() as StripeObject;
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" ? payload.error as StripeObject : null;
    throw new Error(typeof error?.message === "string" ? error.message : `Stripe HTTP ${response.status}`);
  }
  return payload;
}

async function ensurePortalConfiguration() {
  const list = await stripeRequest("/billing_portal/configurations?active=true&limit=100");
  const configurations = Array.isArray(list.data) ? list.data : [];
  const existing = configurations.find((value) => {
    if (!value || typeof value !== "object") return false;
    const metadata = (value as StripeObject).metadata;
    return metadata && typeof metadata === "object" && (metadata as StripeObject).gamesignal === "true";
  }) as StripeObject | undefined;

  if (typeof existing?.id === "string") return existing.id;

  const params = new URLSearchParams();
  params.set("business_profile[headline]", "Manage your GameSignal subscription");
  params.set("default_return_url", `${SITE_URL}/dashboard/settings`);
  params.set("features[customer_update][enabled]", "true");
  params.append("features[customer_update][allowed_updates][]", "email");
  params.append("features[customer_update][allowed_updates][]", "name");
  params.append("features[customer_update][allowed_updates][]", "address");
  params.set("features[invoice_history][enabled]", "true");
  params.set("features[payment_method_update][enabled]", "true");
  params.set("features[subscription_cancel][enabled]", "true");
  params.set("features[subscription_cancel][mode]", "at_period_end");
  params.set("features[subscription_cancel][proration_behavior]", "none");
  params.set("features[subscription_update][enabled]", "false");
  params.set("login_page[enabled]", "false");
  params.set("metadata[gamesignal]", "true");

  const created = await stripeRequest("/billing_portal/configurations", { method: "POST", body: params });
  if (typeof created.id !== "string") throw new Error("Stripe did not create a billing portal configuration.");
  return created.id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = request.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !authHeader) return json({ error: "Unauthorized." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Unauthorized." }, 401);

    const body = await request.json().catch(() => ({})) as {
      action?: "status" | "checkout" | "portal";
      workspace_id?: string;
      plan?: unknown;
      period?: unknown;
    };
    if (!body.action || !body.workspace_id) return json({ error: "Missing workspace or action." }, 400);

    const [{ data: membership, error: membershipError }, { data: subscription, error: subscriptionError }] = await Promise.all([
      userClient
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", body.workspace_id)
        .eq("user_id", authData.user.id)
        .maybeSingle(),
      userClient
        .from("subscriptions")
        .select("plan, status, stripe_customer_id, stripe_subscription_id")
        .eq("workspace_id", body.workspace_id)
        .maybeSingle(),
    ]);
    if (membershipError || !membership) return json({ error: "Forbidden." }, 403);
    if (subscriptionError || !subscription) return json({ error: "Subscription record not found." }, 404);

    const configured = Boolean(Deno.env.get("STRIPE_SECRET_KEY"));
    if (body.action === "status") {
      return json({
        configured,
        plan: subscription.plan ?? "free",
        status: subscription.status ?? "trialing",
        has_customer: Boolean(subscription.stripe_customer_id),
        has_subscription: Boolean(subscription.stripe_subscription_id),
      });
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return json({ error: "Only workspace owners and admins can manage billing." }, 403);
    }
    if (!configured) return json({ error: "Stripe billing is not configured yet." }, 503);

    if (body.action === "portal") {
      if (!subscription.stripe_customer_id) return json({ error: "No Stripe customer exists for this workspace yet." }, 409);
      const configuration = await ensurePortalConfiguration();
      const params = new URLSearchParams();
      params.set("customer", String(subscription.stripe_customer_id));
      params.set("configuration", configuration);
      params.set("return_url", `${SITE_URL}/dashboard/settings`);
      const session = await stripeRequest("/billing_portal/sessions", { method: "POST", body: params });
      if (typeof session.url !== "string") throw new Error("Stripe did not return a portal URL.");
      return json({ url: session.url });
    }

    if (!isPaidPlan(body.plan) || !isPeriod(body.period)) {
      return json({ error: "Invalid billing plan or period." }, 400);
    }

    const alreadyPaid =
      subscription.plan !== "free" &&
      (subscription.status === "active" || subscription.status === "trialing");
    if (alreadyPaid) {
      return json({ error: "This workspace already has a paid subscription. Use Manage billing to change it.", usePortal: true }, 409);
    }

    const lookupKey = lookupKeys[body.plan][body.period];
    const priceList = await stripeRequest(`/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookupKey)}`);
    const prices = Array.isArray(priceList.data) ? priceList.data : [];
    const price = prices[0] && typeof prices[0] === "object" ? prices[0] as StripeObject : null;
    if (!price || typeof price.id !== "string") throw new Error(`Stripe price ${lookupKey} was not found.`);

    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("line_items[0][price]", price.id);
    params.set("line_items[0][quantity]", "1");
    params.set("success_url", `${SITE_URL}/dashboard/settings?billing=success`);
    params.set("cancel_url", `${SITE_URL}/dashboard/settings?billing=cancelled`);
    params.set("client_reference_id", body.workspace_id);
    params.set("allow_promotion_codes", "true");
    params.set("billing_address_collection", "auto");
    params.set("metadata[workspace_id]", body.workspace_id);
    params.set("metadata[plan]", body.plan);
    params.set("metadata[billing_period]", body.period);
    params.set("subscription_data[metadata][workspace_id]", body.workspace_id);
    params.set("subscription_data[metadata][plan]", body.plan);
    params.set("subscription_data[metadata][billing_period]", body.period);

    if (subscription.stripe_customer_id) {
      params.set("customer", String(subscription.stripe_customer_id));
    } else if (authData.user.email) {
      params.set("customer_email", authData.user.email);
    }

    const session = await stripeRequest("/checkout/sessions", { method: "POST", body: params });
    if (typeof session.url !== "string") throw new Error("Stripe did not return a Checkout URL.");
    return json({ url: session.url });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected billing error." }, 500);
  }
});
