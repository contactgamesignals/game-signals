import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assertPaddleCheckoutEnabled,
  buildPaddleRuntimePriceCatalog,
  isPaddleBillingPeriod,
  isPaddlePaidPlan,
  paddleApiBase,
  requirePaddlePrice,
  resolvePaddleEnvironment,
  validatePaddleApiKey,
} from "../_shared/paddle-billing-core.ts";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLIC_SITE_URL = "https://www.whoplaysmygame.com";
const TERMS_VERSION = "2026-08-17-v1";
const PRIVACY_VERSION = "2026-08-17-v1";

type BuyerType = "individual" | "company";
type PaddleObject = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function objectValue(value: unknown): PaddleObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PaddleObject : null;
}

function isBuyerType(value: unknown): value is BuyerType {
  return value === "individual" || value === "company";
}

function canonicalSiteUrl() {
  const configured = Deno.env.get("GAMESIGNAL_SITE_URL")?.trim().replace(/\/+$/, "");
  if (!configured || configured.includes("game-signals.vercel.app")) return PUBLIC_SITE_URL;
  return configured;
}

function paddleCheckoutUrl() {
  const configured = Deno.env.get("PADDLE_CHECKOUT_URL")?.trim();
  if (!configured || configured.includes("game-signals.vercel.app")) return `${canonicalSiteUrl()}/pay`;
  return configured;
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service environment is missing.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function paddleRuntime() {
  const environment = resolvePaddleEnvironment(Deno.env.get("PADDLE_ENV") ?? undefined);
  const apiKeyName = environment === "live" ? "PADDLE_LIVE_API_KEY" : "PADDLE_API_KEY";
  const apiKey = validatePaddleApiKey(environment, Deno.env.get(apiKeyName) ?? undefined);
  const catalog = buildPaddleRuntimePriceCatalog(environment, (key) => Deno.env.get(key) ?? undefined);
  return { environment, apiKey, catalog, baseUrl: paddleApiBase(environment) };
}

async function paddleRequest(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}) {
  const runtime = paddleRuntime();
  const response = await fetch(`${runtime.baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${runtime.apiKey}`,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const payload = await response.json().catch(() => ({})) as PaddleObject;
  if (!response.ok) {
    const error = objectValue(payload.error);
    const detail = typeof error?.detail === "string" ? error.detail : null;
    throw new Error(detail ?? `Paddle HTTP ${response.status}`);
  }
  return payload;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json().catch(() => ({})) as {
      action?: "status" | "checkout" | "portal";
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
        .select("plan, status, billing_provider, billing_customer_id, billing_subscription_id")
        .eq("workspace_id", body.workspace_id)
        .maybeSingle(),
    ]);

    if (membershipError || !membership) return json({ error: "Forbidden." }, 403);
    if (subscriptionError || !subscription) return json({ error: "Subscription record not found." }, 404);

    let runtimeConfigured = false;
    let environment: "sandbox" | "live" = "sandbox";
    try {
      const runtime = paddleRuntime();
      environment = runtime.environment;
      runtimeConfigured = runtime.catalog.length === 6;
    } catch {
      runtimeConfigured = false;
    }

    const billingEnabled = Deno.env.get("PADDLE_BILLING_ENABLED") === "true";
    const liveBillingEnabled = Deno.env.get("PADDLE_LIVE_BILLING_ENABLED") === "true";
    const sandboxCheckoutEnabled = Deno.env.get("PADDLE_SANDBOX_CHECKOUT_ENABLED") === "true";
    const checkoutEnabled = runtimeConfigured && billingEnabled &&
      (environment === "live" ? liveBillingEnabled : sandboxCheckoutEnabled);

    if (body.action === "status") {
      return json({
        configured: checkoutEnabled,
        checkout_enabled: checkoutEnabled,
        provider: "paddle",
        paddle_mode: environment,
        plan: subscription.plan ?? "free",
        status: subscription.status ?? "trialing",
        has_customer: subscription.billing_provider === "paddle" && Boolean(subscription.billing_customer_id),
        has_subscription: subscription.billing_provider === "paddle" && Boolean(subscription.billing_subscription_id),
      });
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return json({ error: "Only workspace owners and admins can manage billing." }, 403);
    }

    const runtime = paddleRuntime();
    if (runtime.catalog.length !== 6) {
      return json({ error: "All six Paddle plan prices must be configured before billing is enabled." }, 503);
    }

    if (body.action === "portal") {
      if (subscription.billing_provider !== "paddle" || !subscription.billing_customer_id) {
        return json({ error: "No Paddle customer exists for this workspace yet." }, 409);
      }
      const subscriptionIds = subscription.billing_subscription_id ? [String(subscription.billing_subscription_id)] : [];
      const portal = await paddleRequest(`/customers/${encodeURIComponent(String(subscription.billing_customer_id))}/portal-sessions`, {
        method: "POST",
        body: subscriptionIds.length ? { subscription_ids: subscriptionIds } : {},
      });
      const data = objectValue(portal.data);
      const urls = objectValue(data?.urls);
      const general = objectValue(urls?.general);
      if (typeof general?.overview !== "string") throw new Error("Paddle did not return a customer portal URL.");
      return json({ url: general.overview, provider: "paddle" });
    }

    if (runtime.environment === "sandbox" && Deno.env.get("PADDLE_SANDBOX_CHECKOUT_ENABLED") !== "true") {
      return json({ error: "Paid checkout is not available while Paddle LIVE is being activated." }, 503);
    }
    assertPaddleCheckoutEnabled({
      environment: runtime.environment,
      billingEnabled: Deno.env.get("PADDLE_BILLING_ENABLED") ?? undefined,
      liveBillingEnabled: Deno.env.get("PADDLE_LIVE_BILLING_ENABLED") ?? undefined,
    });

    if (!isPaddlePaidPlan(body.plan) || !isPaddleBillingPeriod(body.period)) {
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

    const existingPaddleSubscriptionNeedsPortal = subscription.billing_provider === "paddle" &&
      Boolean(subscription.billing_subscription_id) && subscription.status !== "canceled";
    const alreadyPaid = subscription.plan !== "free" &&
      (subscription.status === "active" || subscription.status === "trialing");
    if (existingPaddleSubscriptionNeedsPortal || alreadyPaid) {
      return json({ error: "This workspace already has a paid subscription. Use Manage billing to change it.", usePortal: true }, 409);
    }

    const price = requirePaddlePrice(runtime.catalog, body.plan, body.period);
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
        billing_provider: "paddle",
        user_agent: request.headers.get("user-agent"),
      })
      .select("id")
      .single();
    if (consentError || !consent?.id) throw new Error("Could not record checkout consent.");

    const transaction = await paddleRequest("/transactions", {
      method: "POST",
      body: {
        items: [{ price_id: price.priceId, quantity: 1 }],
        collection_mode: "automatic",
        custom_data: {
          gamesignal: "true",
          product: "who-plays-my-game",
          workspace_id: body.workspace_id,
          plan: body.plan,
          billing_period: body.period,
          buyer_type: body.buyer_type,
          consent_id: String(consent.id),
        },
        checkout: { url: paddleCheckoutUrl() },
      },
    });

    const transactionData = objectValue(transaction.data);
    const checkout = objectValue(transactionData?.checkout);
    if (typeof transactionData?.id !== "string" || typeof checkout?.url !== "string") {
      throw new Error("Paddle did not return a transaction checkout URL.");
    }

    const { error: consentLinkError } = await admin
      .from("billing_checkout_consents")
      .update({ billing_checkout_id: transactionData.id })
      .eq("id", consent.id);
    if (consentLinkError) console.error("Could not link consent to Paddle transaction", consentLinkError);

    return json({ url: checkout.url, provider: "paddle", transaction_id: transactionData.id });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected Paddle billing error." }, 500);
  }
});
