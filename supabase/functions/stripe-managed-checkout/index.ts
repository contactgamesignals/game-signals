import { createClient } from "npm:@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SITE_URL = Deno.env.get("GAMESIGNAL_SITE_URL") ?? "https://game-signals.vercel.app";
const TERMS_VERSION = "2026-08-13-v2";
const PRIVACY_VERSION = "2026-08-13-v2";
const STRIPE_TEST_KEY_PATTERN = /^(sk|rk)_test_/;
const STRIPE_MANAGED_PAYMENTS_API_VERSION = "2025-03-31.basil";
const MERCHANT_OF_RECORD = "stripe_managed_payments";

const lookupKeys = {
  indie: { monthly: "gamesignal_indie_monthly", yearly: "gamesignal_indie_yearly" },
  studio: { monthly: "gamesignal_studio_monthly", yearly: "gamesignal_studio_yearly" },
  publisher: { monthly: "gamesignal_publisher_monthly", yearly: "gamesignal_publisher_yearly" },
} as const;

type PaidPlan = keyof typeof lookupKeys;
type Period = "monthly" | "yearly";
type BuyerType = "individual" | "company";
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

function isBuyerType(value: unknown): value is BuyerType {
  return value === "individual" || value === "company";
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service environment is missing.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function managedPaymentsSecret() {
  if (Deno.env.get("STRIPE_MANAGED_PAYMENTS_ENABLED") !== "true") {
    throw new Error("Stripe Managed Payments checkout is locked until STRIPE_MANAGED_PAYMENTS_ENABLED=true.");
  }
  const secret = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secret) throw new Error("Stripe secret is not configured.");
  if (!STRIPE_TEST_KEY_PATTERN.test(secret)) {
    throw new Error("Stripe Managed Payments readiness checkout is sandbox-only. LIVE remains locked.");
  }
  return secret;
}

async function stripeRequest(path: string, options: { method?: "GET" | "POST"; body?: URLSearchParams } = {}) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${managedPaymentsSecret()}`,
      "Stripe-Version": STRIPE_MANAGED_PAYMENTS_API_VERSION,
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

function productIdFromPrice(price: StripeObject) {
  if (typeof price.product === "string") return price.product;
  if (price.product && typeof price.product === "object" && typeof (price.product as StripeObject).id === "string") {
    return String((price.product as StripeObject).id);
  }
  return null;
}

async function requireManagedPaymentsPrice(plan: PaidPlan, period: Period) {
  const lookupKey = lookupKeys[plan][period];
  const priceList = await stripeRequest(`/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookupKey)}`);
  const prices = Array.isArray(priceList.data) ? priceList.data : [];
  const price = prices[0] && typeof prices[0] === "object" ? prices[0] as StripeObject : null;
  if (!price || typeof price.id !== "string") throw new Error(`Stripe price ${lookupKey} was not found.`);

  const productId = productIdFromPrice(price);
  if (!productId) throw new Error(`Stripe product for ${lookupKey} was not found.`);
  const product = await stripeRequest(`/products/${encodeURIComponent(productId)}`);
  const requiredTaxCode = Deno.env.get("STRIPE_MANAGED_PAYMENTS_TAX_CODE")?.trim() || "txcd_10103001";
  if (product.tax_code !== requiredTaxCode) {
    throw new Error(`Stripe product ${productId} must use the approved Managed Payments tax code ${requiredTaxCode}.`);
  }
  return price.id;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json().catch(() => ({})) as {
      workspace_id?: string;
      plan?: unknown;
      period?: unknown;
      buyer_type?: unknown;
      terms_accepted?: unknown;
      recurring_billing_accepted?: unknown;
      immediate_service_requested?: unknown;
    };

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const authHeader = request.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !authHeader) return json({ error: "Unauthorized." }, 401);
    managedPaymentsSecret();

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Unauthorized." }, 401);
    if (!body.workspace_id) return json({ error: "Missing workspace." }, 400);

    const [{ data: membership, error: membershipError }, { data: subscription, error: subscriptionError }] = await Promise.all([
      userClient
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", body.workspace_id)
        .eq("user_id", authData.user.id)
        .maybeSingle(),
      userClient
        .from("subscriptions")
        .select("plan, status, stripe_customer_id")
        .eq("workspace_id", body.workspace_id)
        .maybeSingle(),
    ]);
    if (membershipError || !membership) return json({ error: "Forbidden." }, 403);
    if (membership.role !== "owner" && membership.role !== "admin") {
      return json({ error: "Only workspace owners and admins can manage billing." }, 403);
    }
    if (subscriptionError || !subscription) return json({ error: "Subscription record not found." }, 404);

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

    const alreadyPaid = subscription.plan !== "free" &&
      (subscription.status === "active" || subscription.status === "trialing" || subscription.status === "blocked_tax");
    if (alreadyPaid) {
      return json({ error: "This workspace already has a paid subscription. Existing subscriptions are not converted to Managed Payments." }, 409);
    }

    const priceId = await requireManagedPaymentsPrice(body.plan, body.period);
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
        merchant_of_record: MERCHANT_OF_RECORD,
        user_agent: request.headers.get("user-agent"),
      })
      .select("id")
      .single();
    if (consentError || !consent?.id) throw new Error("Could not record Managed Payments checkout consent.");

    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("managed_payments[enabled]", "true");
    params.set("line_items[0][price]", priceId);
    params.set("line_items[0][quantity]", "1");
    params.set("success_url", `${SITE_URL}/dashboard/settings?billing=success`);
    params.set("cancel_url", `${SITE_URL}/dashboard/settings?billing=cancelled`);
    params.set("client_reference_id", body.workspace_id);
    params.set("allow_promotion_codes", "true");
    params.set("metadata[workspace_id]", body.workspace_id);
    params.set("metadata[plan]", body.plan);
    params.set("metadata[billing_period]", body.period);
    params.set("metadata[buyer_type]", body.buyer_type);
    params.set("metadata[consent_id]", String(consent.id));
    params.set("metadata[merchant_of_record]", MERCHANT_OF_RECORD);
    params.set("subscription_data[metadata][workspace_id]", body.workspace_id);
    params.set("subscription_data[metadata][plan]", body.plan);
    params.set("subscription_data[metadata][billing_period]", body.period);
    params.set("subscription_data[metadata][buyer_type]", body.buyer_type);
    params.set("subscription_data[metadata][consent_id]", String(consent.id));
    params.set("subscription_data[metadata][merchant_of_record]", MERCHANT_OF_RECORD);

    // Managed Payments owns tax calculation, tax-ID collection, payment-method
    // selection and customer billing identity. Do not send automatic_tax,
    // tax_id_collection, customer_update, shipping or payment-method overrides.
    if (subscription.stripe_customer_id) {
      params.set("customer", String(subscription.stripe_customer_id));
    } else if (authData.user.email) {
      params.set("customer_email", authData.user.email);
    }

    const session = await stripeRequest("/checkout/sessions", { method: "POST", body: params });
    if (typeof session.url !== "string" || typeof session.id !== "string") {
      throw new Error("Stripe did not return a Managed Payments Checkout URL.");
    }

    const { error: consentLinkError } = await admin
      .from("billing_checkout_consents")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", consent.id);
    if (consentLinkError) console.error("Could not link consent to Managed Payments Checkout session", consentLinkError);

    return json({ url: session.url, merchant_of_record: MERCHANT_OF_RECORD, stripe_mode: "sandbox_managed_payments" });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected Managed Payments checkout error." }, 500);
  }
});
