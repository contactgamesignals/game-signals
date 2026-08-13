import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SITE_URL = Deno.env.get("GAMESIGNAL_SITE_URL") ?? "https://game-signals.vercel.app";
const PORTAL_CONFIGURATION_VERSION = "2";
const TERMS_VERSION = "2026-08-13-v2";
const PRIVACY_VERSION = "2026-08-13-v2";

const lookupKeys = {
  indie: { monthly: "gamesignal_indie_monthly", yearly: "gamesignal_indie_yearly" },
  studio: { monthly: "gamesignal_studio_monthly", yearly: "gamesignal_studio_yearly" },
  publisher: { monthly: "gamesignal_publisher_monthly", yearly: "gamesignal_publisher_yearly" },
} as const;

const allLookupKeys = Object.values(lookupKeys).flatMap((periods) => [periods.monthly, periods.yearly]);

type PaidPlan = keyof typeof lookupKeys;
type Period = "monthly" | "yearly";
type BuyerType = "individual" | "company";
type StripeObject = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service environment is missing.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

let cronHashCache: { value: string; expiresAt: number } | null = null;
async function expectedCronHash() {
  if (cronHashCache && cronHashCache.expiresAt > Date.now()) return cronHashCache.value;
  const { data, error } = await serviceClient()
    .from("internal_settings")
    .select("value")
    .eq("key", "cron_secret_sha256")
    .maybeSingle();
  if (error || !data?.value) return null;
  cronHashCache = { value: String(data.value), expiresAt: Date.now() + 5 * 60_000 };
  return cronHashCache.value;
}

async function validCronSecret(value: string | null) {
  if (!value) return false;
  const expected = await expectedCronHash();
  if (!expected) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hash === expected;
}

function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "indie" || value === "studio" || value === "publisher";
}

function isPeriod(value: unknown): value is Period {
  return value === "monthly" || value === "yearly";
}

function isBuyerType(value: unknown): value is BuyerType {
  return value === "individual" || value === "company";
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

async function getPortalProducts() {
  const grouped = new Map<string, string[]>();

  for (const lookupKey of allLookupKeys) {
    const list = await stripeRequest(`/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookupKey)}`);
    const data = Array.isArray(list.data) ? list.data : [];
    const price = data[0] && typeof data[0] === "object" ? data[0] as StripeObject : null;
    if (!price || typeof price.id !== "string") throw new Error(`Stripe price ${lookupKey} was not found.`);
    const productId = typeof price.product === "string"
      ? price.product
      : price.product && typeof price.product === "object" && typeof (price.product as StripeObject).id === "string"
        ? String((price.product as StripeObject).id)
        : null;
    if (!productId) throw new Error(`Stripe product for ${lookupKey} was not found.`);
    grouped.set(productId, [...(grouped.get(productId) ?? []), price.id]);
  }

  return Array.from(grouped.entries()).map(([product, prices]) => ({ product, prices }));
}

async function ensurePortalConfiguration() {
  const list = await stripeRequest("/billing_portal/configurations?active=true&limit=100");
  const configurations = Array.isArray(list.data) ? list.data : [];
  const existing = configurations.find((value) => {
    if (!value || typeof value !== "object") return false;
    const metadata = (value as StripeObject).metadata;
    return metadata && typeof metadata === "object" &&
      (metadata as StripeObject).gamesignal === "true" &&
      (metadata as StripeObject).gamesignal_version === PORTAL_CONFIGURATION_VERSION;
  }) as StripeObject | undefined;

  if (typeof existing?.id === "string") return existing.id;

  const portalProducts = await getPortalProducts();
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
  params.set("features[subscription_update][enabled]", "true");
  params.append("features[subscription_update][default_allowed_updates][]", "price");
  params.set("features[subscription_update][proration_behavior]", "create_prorations");
  params.set("features[subscription_update][billing_cycle_anchor]", "unchanged");

  portalProducts.forEach((entry, index) => {
    params.set(`features[subscription_update][products][${index}][product]`, entry.product);
    entry.prices.forEach((priceId) => {
      params.append(`features[subscription_update][products][${index}][prices][]`, priceId);
    });
  });

  params.set("login_page[enabled]", "false");
  params.set("metadata[gamesignal]", "true");
  params.set("metadata[gamesignal_version]", PORTAL_CONFIGURATION_VERSION);

  const created = await stripeRequest("/billing_portal/configurations", { method: "POST", body: params });
  if (typeof created.id !== "string") throw new Error("Stripe did not create a billing portal configuration.");
  return created.id;
}

async function runIntegrationHealthcheck() {
  await stripeRequest("/account");

  const found = new Set<string>();
  for (const lookupKey of allLookupKeys) {
    const list = await stripeRequest(`/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookupKey)}`);
    const data = Array.isArray(list.data) ? list.data : [];
    const price = data[0] && typeof data[0] === "object" ? data[0] as StripeObject : null;
    if (price && typeof price.id === "string") found.add(lookupKey);
  }
  if (found.size !== allLookupKeys.length) {
    throw new Error(`Expected ${allLookupKeys.length} Stripe prices, found ${found.size}.`);
  }

  const portalConfiguration = await ensurePortalConfiguration();
  const indiePriceList = await stripeRequest(`/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookupKeys.indie.monthly)}`);
  const indiePrices = Array.isArray(indiePriceList.data) ? indiePriceList.data : [];
  const indiePrice = indiePrices[0] && typeof indiePrices[0] === "object" ? indiePrices[0] as StripeObject : null;
  if (!indiePrice || typeof indiePrice.id !== "string") throw new Error("Indie monthly price missing.");

  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", indiePrice.id);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${SITE_URL}/dashboard/settings?billing=test-success`);
  params.set("cancel_url", `${SITE_URL}/dashboard/settings?billing=test-cancelled`);
  params.set("billing_address_collection", "required");
  params.set("tax_id_collection[enabled]", "true");
  params.set("tax_id_collection[required]", "if_supported");
  params.set("metadata[gamesignal_test]", "true");
  const session = await stripeRequest("/checkout/sessions", { method: "POST", body: params });
  if (typeof session.id !== "string") throw new Error("Stripe did not create a test Checkout Session.");
  await stripeRequest(`/checkout/sessions/${encodeURIComponent(session.id)}/expire`, { method: "POST", body: new URLSearchParams() });

  return {
    ok: true,
    stripe: "authenticated",
    prices: found.size,
    checkout: "company_fields_created_and_expired",
    portal: typeof portalConfiguration === "string" ? "configured" : "error",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json().catch(() => ({})) as {
      action?: "healthcheck" | "integration_healthcheck" | "status" | "checkout" | "portal";
      workspace_id?: string;
      plan?: unknown;
      period?: unknown;
      buyer_type?: unknown;
      terms_accepted?: unknown;
      recurring_billing_accepted?: unknown;
      immediate_service_requested?: unknown;
    };

    if (body.action === "healthcheck" || body.action === "integration_healthcheck") {
      if (!(await validCronSecret(request.headers.get("x-cron-secret")))) {
        return json({ error: "Forbidden." }, 403);
      }
      if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ error: "Stripe secret is not configured." }, 503);
      if (body.action === "integration_healthcheck") return json(await runIntegrationHealthcheck());
      await stripeRequest("/account");
      return json({ ok: true, stripe: "authenticated" });
    }

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
    if (!isBuyerType(body.buyer_type)) {
      return json({ error: "Choose whether you are buying as an individual or a company." }, 400);
    }
    if (body.terms_accepted !== true || body.recurring_billing_accepted !== true) {
      return json({ error: "Terms and recurring billing must be accepted before checkout." }, 400);
    }
    if (body.buyer_type === "individual" && body.immediate_service_requested !== true) {
      return json({ error: "Individuals must explicitly request immediate service before checkout." }, 400);
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

    const admin = serviceClient();
    const { data: consent, error: consentError } = await admin
      .from("billing_checkout_consents")
      .insert({
        workspace_id: body.workspace_id,
        user_id: authData.user.id,
        buyer_type: body.buyer_type,
        plan: body.plan,
        billing_period: body.period,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        terms_accepted: true,
        recurring_billing_accepted: true,
        immediate_service_requested: body.buyer_type === "individual" ? true : Boolean(body.immediate_service_requested),
        user_agent: request.headers.get("user-agent"),
      })
      .select("id")
      .single();
    if (consentError || !consent?.id) throw new Error("Could not record checkout consent.");

    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("line_items[0][price]", price.id);
    params.set("line_items[0][quantity]", "1");
    params.set("success_url", `${SITE_URL}/dashboard/settings?billing=success`);
    params.set("cancel_url", `${SITE_URL}/dashboard/settings?billing=cancelled`);
    params.set("client_reference_id", body.workspace_id);
    params.set("allow_promotion_codes", "true");
    params.set("billing_address_collection", "required");
    params.set("metadata[workspace_id]", body.workspace_id);
    params.set("metadata[plan]", body.plan);
    params.set("metadata[billing_period]", body.period);
    params.set("metadata[buyer_type]", body.buyer_type);
    params.set("metadata[consent_id]", String(consent.id));
    params.set("metadata[terms_version]", TERMS_VERSION);
    params.set("subscription_data[metadata][workspace_id]", body.workspace_id);
    params.set("subscription_data[metadata][plan]", body.plan);
    params.set("subscription_data[metadata][billing_period]", body.period);
    params.set("subscription_data[metadata][buyer_type]", body.buyer_type);
    params.set("subscription_data[metadata][consent_id]", String(consent.id));

    if (body.buyer_type === "company") {
      params.set("tax_id_collection[enabled]", "true");
      params.set("tax_id_collection[required]", "if_supported");
    }

    if (subscription.stripe_customer_id) {
      params.set("customer", String(subscription.stripe_customer_id));
      params.set("customer_update[address]", "auto");
      if (body.buyer_type === "company") params.set("customer_update[name]", "auto");
    } else if (authData.user.email) {
      params.set("customer_email", authData.user.email);
    }

    const session = await stripeRequest("/checkout/sessions", { method: "POST", body: params });
    if (typeof session.url !== "string" || typeof session.id !== "string") {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    const { error: consentLinkError } = await admin
      .from("billing_checkout_consents")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", consent.id);
    if (consentLinkError) console.error("Could not link consent to Stripe session", consentLinkError);

    return json({ url: session.url });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected billing error." }, 500);
  }
});
