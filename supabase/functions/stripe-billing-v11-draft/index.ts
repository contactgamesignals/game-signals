import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assertStripePayloadMode,
  inspectStripeRuntimeMode,
  requireStripeRuntimeMode,
  STRIPE_RUNTIME_API_VERSION,
} from "../_shared/stripe-runtime-mode.ts";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SITE_URL = Deno.env.get("GAMESIGNAL_SITE_URL") ?? "https://game-signals.vercel.app";
const PORTAL_CONFIGURATION_VERSION = "3";
const TERMS_VERSION = "2026-08-13-v2";
const PRIVACY_VERSION = "2026-08-13-v2";
const MIN_CHECKOUT_LIFETIME_SECONDS = 30 * 60;
const LAUNCH_BILLING_COUNTRY = "PL";

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
type SupabaseAdmin = ReturnType<typeof serviceClient>;

type CheckoutAttempt = {
  id: string;
  workspace_id: string;
  user_id: string;
  buyer_type: BuyerType;
  plan: PaidPlan;
  billing_period: Period;
  status: "creating" | "open" | "completed" | "expired" | "failed";
  stripe_checkout_session_id: string | null;
  expires_at: string;
  stripe_lookup_key: string | null;
  stripe_price_id: string | null;
  stripe_customer_id_snapshot: string | null;
  customer_email_snapshot: string | null;
};

class HttpError extends Error {
  status: number;
  payload: Record<string, unknown>;

  constructor(status: number, payload: Record<string, unknown>) {
    super(typeof payload.error === "string" ? payload.error : "Request failed.");
    this.status = status;
    this.payload = payload;
  }
}

class StripeApiError extends Error {
  status: number;
  code: string | null;
  param: string | null;

  constructor(message: string, status: number, code: string | null, param: string | null) {
    super(message);
    this.status = status;
    this.code = code;
    this.param = param;
  }
}

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

function objectValue(value: unknown): StripeObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StripeObject : null;
}

async function stripeRequest(
  path: string,
  options: { method?: "GET" | "POST"; body?: URLSearchParams; idempotencyKey?: string } = {},
) {
  const stripeMode = requireStripeRuntimeMode();

  let response: Response;
  try {
    response = await fetch(`https://api.stripe.com/v1${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${stripeMode.secretKey}`,
        "Stripe-Version": STRIPE_RUNTIME_API_VERSION,
        ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: options.body,
    });
  } catch (error) {
    throw new Error(`Stripe network request failed: ${error instanceof Error ? error.message : "unknown network error"}`);
  }

  const payload = await response.json().catch(() => ({})) as StripeObject;
  if (!response.ok) {
    const stripeError = objectValue(payload.error);
    throw new StripeApiError(
      typeof stripeError?.message === "string" ? stripeError.message : `Stripe HTTP ${response.status}`,
      response.status,
      typeof stripeError?.code === "string" ? stripeError.code : null,
      typeof stripeError?.param === "string" ? stripeError.param : null,
    );
  }
  assertStripePayloadMode(payload, stripeMode.livemode, `Stripe API ${options.method ?? "GET"} ${path}`);
  return payload;
}

function integrationIdentifier(attemptId: string) {
  const alphabet = "abcdefghijklmnop";
  const hex = attemptId.replaceAll("-", "").slice(0, 8).toLowerCase();
  const suffix = Array.from(hex, (character) => {
    const value = Number.parseInt(character, 16);
    return Number.isFinite(value) ? alphabet[value] : "a";
  }).join("");
  return `gamesignal_v11_${suffix}`;
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
  params.set("business_profile[privacy_policy_url]", `${SITE_URL}/privacy`);
  params.set("business_profile[terms_of_service_url]", `${SITE_URL}/terms`);
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

  const created = await stripeRequest("/billing_portal/configurations", {
    method: "POST",
    body: params,
    idempotencyKey: `gamesignal-portal-configuration-${PORTAL_CONFIGURATION_VERSION}`,
  });
  if (typeof created.id !== "string") throw new Error("Stripe did not create a billing portal configuration.");
  return created.id;
}

async function runIntegrationHealthcheck() {
  const stripeMode = requireStripeRuntimeMode();
  if (stripeMode.livemode) {
    throw new HttpError(409, {
      error: "The destructive Stripe integration healthcheck is sandbox-only and is never run against LIVE.",
      stripe_mode: stripeMode.label,
    });
  }

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

  const healthcheckId = crypto.randomUUID();
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", indiePrice.id);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${SITE_URL}/dashboard/settings?billing=test-success`);
  params.set("cancel_url", `${SITE_URL}/dashboard/settings?billing=test-cancelled`);
  params.set("billing_address_collection", "required");
  params.set("automatic_tax[enabled]", "true");
  params.set("name_collection[business][enabled]", "true");
  params.set("name_collection[business][optional]", "false");
  params.set("tax_id_collection[enabled]", "true");
  params.set("tax_id_collection[required]", "if_supported");
  params.set("metadata[gamesignal_test]", "true");
  params.set("metadata[seller_vat_status]", "active");
  params.set("metadata[declared_billing_country]", LAUNCH_BILLING_COUNTRY);
  params.set("integration_identifier", integrationIdentifier(healthcheckId));
  params.set("expires_at", String(Math.floor(Date.now() / 1000) + 35 * 60));
  const session = await stripeRequest("/checkout/sessions", {
    method: "POST",
    body: params,
    idempotencyKey: `gamesignal-healthcheck-${healthcheckId}`,
  });
  if (typeof session.id !== "string") throw new Error("Stripe did not create a test Checkout Session.");
  await stripeRequest(`/checkout/sessions/${encodeURIComponent(session.id)}/expire`, {
    method: "POST",
    body: new URLSearchParams(),
    idempotencyKey: `gamesignal-healthcheck-expire-${healthcheckId}`,
  });

  return {
    ok: true,
    stripe: "authenticated",
    stripe_api_version: STRIPE_RUNTIME_API_VERSION,
    stripe_mode: stripeMode.label,
    prices: found.size,
    checkout: "company_identity_tax_fields_created_and_expired",
    portal: typeof portalConfiguration === "string" ? "configured" : "error",
  };
}

async function getAttempt(admin: SupabaseAdmin, attemptId: string): Promise<CheckoutAttempt> {
  const { data, error } = await admin
    .from("billing_checkout_attempts")
    .select("id, workspace_id, user_id, buyer_type, plan, billing_period, status, stripe_checkout_session_id, expires_at, stripe_lookup_key, stripe_price_id, stripe_customer_id_snapshot, customer_email_snapshot")
    .eq("id", attemptId)
    .single();
  if (error || !data) throw new Error("Could not load the checkout reservation.");
  return data as CheckoutAttempt;
}

async function reserveAttempt(
  admin: SupabaseAdmin,
  workspaceId: string,
  userId: string,
  buyerType: BuyerType,
  plan: PaidPlan,
  period: Period,
) {
  const { data, error } = await admin.rpc("reserve_subscription_checkout", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
    p_buyer_type: buyerType,
    p_plan: plan,
    p_billing_period: period,
  });

  if (error) {
    const message = typeof error.message === "string" ? error.message : "Could not reserve Checkout.";
    if (message.includes("already has a Stripe subscription")) {
      throw new HttpError(409, {
        error: "This workspace already has a Stripe subscription. Use Manage billing instead of creating another one.",
        usePortal: true,
      });
    }
    throw new Error(message);
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || typeof row.attempt_id !== "string") throw new Error("Checkout reservation did not return an attempt.");
  const attempt = await getAttempt(admin, row.attempt_id);

  if (
    attempt.user_id !== userId ||
    attempt.buyer_type !== buyerType ||
    attempt.plan !== plan ||
    attempt.billing_period !== period
  ) {
    throw new HttpError(409, {
      error: "Another Checkout is already in progress for this workspace. Finish or expire that Checkout before starting a different purchase.",
      checkoutInProgress: true,
    });
  }

  return attempt;
}

async function markAttempt(
  admin: SupabaseAdmin,
  attemptId: string,
  values: Record<string, unknown>,
) {
  const { error } = await admin.from("billing_checkout_attempts").update(values).eq("id", attemptId);
  if (error) throw new Error("Could not update the checkout reservation.");
}

async function getOrCreateConsent(
  admin: SupabaseAdmin,
  attempt: CheckoutAttempt,
  userAgent: string | null,
) {
  const existing = await admin
    .from("billing_checkout_consents")
    .select("id, user_id, buyer_type, plan, billing_period")
    .eq("checkout_attempt_id", attempt.id)
    .maybeSingle();
  if (existing.error) throw new Error("Could not read checkout consent evidence.");

  if (existing.data?.id) {
    if (
      existing.data.user_id !== attempt.user_id ||
      existing.data.buyer_type !== attempt.buyer_type ||
      existing.data.plan !== attempt.plan ||
      existing.data.billing_period !== attempt.billing_period
    ) {
      throw new Error("Checkout consent evidence does not match its reservation.");
    }
    return String(existing.data.id);
  }

  const inserted = await admin
    .from("billing_checkout_consents")
    .insert({
      workspace_id: attempt.workspace_id,
      user_id: attempt.user_id,
      buyer_type: attempt.buyer_type,
      plan: attempt.plan,
      billing_period: attempt.billing_period,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
      terms_accepted: true,
      recurring_billing_accepted: true,
      immediate_service_requested: attempt.buyer_type === "individual",
      user_agent: userAgent,
      checkout_attempt_id: attempt.id,
    })
    .select("id")
    .single();

  if (!inserted.error && inserted.data?.id) return String(inserted.data.id);

  if (inserted.error?.code === "23505") {
    const raced = await admin
      .from("billing_checkout_consents")
      .select("id")
      .eq("checkout_attempt_id", attempt.id)
      .single();
    if (!raced.error && raced.data?.id) return String(raced.data.id);
  }

  throw new Error("Could not record checkout consent evidence.");
}

async function freezeAttemptStripeParameters(
  admin: SupabaseAdmin,
  attempt: CheckoutAttempt,
  lookupKey: string,
  stripeCustomerId: string | null,
  customerEmail: string | null,
) {
  if (attempt.stripe_price_id) {
    if (attempt.stripe_lookup_key !== lookupKey) throw new Error("Frozen Checkout price does not match the reserved plan.");
    return attempt;
  }

  const priceList = await stripeRequest(`/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookupKey)}`);
  const prices = Array.isArray(priceList.data) ? priceList.data : [];
  const price = prices[0] && typeof prices[0] === "object" ? prices[0] as StripeObject : null;
  if (!price || typeof price.id !== "string") throw new Error(`Stripe price ${lookupKey} was not found.`);

  const { error } = await admin
    .from("billing_checkout_attempts")
    .update({
      stripe_lookup_key: lookupKey,
      stripe_price_id: price.id,
      stripe_customer_id_snapshot: stripeCustomerId,
      customer_email_snapshot: stripeCustomerId ? null : customerEmail,
    })
    .eq("id", attempt.id)
    .is("stripe_price_id", null);
  if (error) throw new Error("Could not freeze Checkout parameters.");

  const frozen = await getAttempt(admin, attempt.id);
  if (!frozen.stripe_price_id || frozen.stripe_lookup_key !== lookupKey) {
    throw new Error("Checkout parameters were not frozen correctly.");
  }
  return frozen;
}

async function ensureConsentSessionLink(admin: SupabaseAdmin, consentId: string, sessionId: string) {
  const { error } = await admin
    .from("billing_checkout_consents")
    .update({ stripe_checkout_session_id: sessionId })
    .eq("id", consentId);
  if (error) throw new Error("Could not link checkout consent to the Stripe Session.");
}

function checkoutParams(attempt: CheckoutAttempt, consentId: string) {
  if (!attempt.stripe_price_id) throw new Error("Checkout price is not frozen.");

  const expirySeconds = Math.floor(new Date(attempt.expires_at).getTime() / 1000);
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", attempt.stripe_price_id);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${SITE_URL}/dashboard/settings?billing=success`);
  params.set("cancel_url", `${SITE_URL}/dashboard/settings?billing=cancelled`);
  params.set("client_reference_id", attempt.workspace_id);
  params.set("allow_promotion_codes", "true");
  params.set("billing_address_collection", "required");
  params.set("automatic_tax[enabled]", "true");
  params.set("expires_at", String(expirySeconds));
  params.set("integration_identifier", integrationIdentifier(attempt.id));
  params.set("metadata[workspace_id]", attempt.workspace_id);
  params.set("metadata[plan]", attempt.plan);
  params.set("metadata[billing_period]", attempt.billing_period);
  params.set("metadata[buyer_type]", attempt.buyer_type);
  params.set("metadata[consent_id]", consentId);
  params.set("metadata[checkout_attempt_id]", attempt.id);
  params.set("metadata[terms_version]", TERMS_VERSION);
  params.set("metadata[seller_vat_status]", "active");
  params.set("metadata[declared_billing_country]", LAUNCH_BILLING_COUNTRY);
  params.set("subscription_data[metadata][workspace_id]", attempt.workspace_id);
  params.set("subscription_data[metadata][plan]", attempt.plan);
  params.set("subscription_data[metadata][billing_period]", attempt.billing_period);
  params.set("subscription_data[metadata][buyer_type]", attempt.buyer_type);
  params.set("subscription_data[metadata][consent_id]", consentId);
  params.set("subscription_data[metadata][checkout_attempt_id]", attempt.id);
  params.set("subscription_data[metadata][seller_vat_status]", "active");
  params.set("subscription_data[metadata][declared_billing_country]", LAUNCH_BILLING_COUNTRY);

  if (attempt.buyer_type === "company") {
    params.set("name_collection[business][enabled]", "true");
    params.set("name_collection[business][optional]", "false");
    params.set("tax_id_collection[enabled]", "true");
    params.set("tax_id_collection[required]", "if_supported");
  } else {
    params.set("name_collection[individual][enabled]", "true");
    params.set("name_collection[individual][optional]", "false");
  }

  if (attempt.stripe_customer_id_snapshot) {
    params.set("customer", attempt.stripe_customer_id_snapshot);
    params.set("customer_update[address]", "auto");
    params.set("customer_update[name]", "auto");
  } else if (attempt.customer_email_snapshot) {
    params.set("customer_email", attempt.customer_email_snapshot);
  }

  return params;
}

async function openOrResumeCheckout(args: {
  admin: SupabaseAdmin;
  workspaceId: string;
  userId: string;
  userEmail: string | null;
  userAgent: string | null;
  buyerType: BuyerType;
  plan: PaidPlan;
  period: Period;
  stripeCustomerId: string | null;
}) {
  const { admin, workspaceId, userId, userEmail, userAgent, buyerType, plan, period, stripeCustomerId } = args;
  const lookupKey = lookupKeys[plan][period];

  for (let pass = 0; pass < 2; pass += 1) {
    let attempt = await reserveAttempt(admin, workspaceId, userId, buyerType, plan, period);
    const consentId = await getOrCreateConsent(admin, attempt, userAgent);
    attempt = await freezeAttemptStripeParameters(admin, attempt, lookupKey, stripeCustomerId, userEmail);

    if (attempt.stripe_checkout_session_id) {
      const existing = await stripeRequest(`/checkout/sessions/${encodeURIComponent(attempt.stripe_checkout_session_id)}`);
      const status = typeof existing.status === "string" ? existing.status : null;

      if (status === "open" && typeof existing.url === "string") {
        if (attempt.status !== "open") await markAttempt(admin, attempt.id, { status: "open" });
        await ensureConsentSessionLink(admin, consentId, attempt.stripe_checkout_session_id);
        return { url: existing.url, resumed: true, attemptId: attempt.id };
      }
      if (status === "complete") {
        if (attempt.status !== "completed") await markAttempt(admin, attempt.id, { status: "completed" });
        await ensureConsentSessionLink(admin, consentId, attempt.stripe_checkout_session_id);
        throw new HttpError(409, {
          error: "This Checkout has already completed. Refresh billing status instead of starting another subscription.",
          refreshBilling: true,
        });
      }
      if (status === "expired") {
        await markAttempt(admin, attempt.id, { status: "expired" });
        continue;
      }

      throw new HttpError(409, {
        error: "The existing Stripe Checkout is not in a resumable state yet. Please retry shortly.",
        checkoutInProgress: true,
      });
    }

    const params = checkoutParams(attempt, consentId);
    const idempotencyKey = `gamesignal-checkout-${attempt.id}`;

    try {
      const session = await stripeRequest("/checkout/sessions", {
        method: "POST",
        body: params,
        idempotencyKey,
      });
      if (typeof session.url !== "string" || typeof session.id !== "string") {
        throw new Error("Stripe did not return a Checkout URL.");
      }

      await markAttempt(admin, attempt.id, {
        status: "open",
        stripe_checkout_session_id: session.id,
      });
      await ensureConsentSessionLink(admin, consentId, session.id);
      return { url: session.url, resumed: false, attemptId: attempt.id };
    } catch (error) {
      const remainingSeconds = Math.floor((new Date(attempt.expires_at).getTime() - Date.now()) / 1000);
      const expiryRejected = error instanceof StripeApiError &&
        (error.param === "expires_at" || /expires_at|expire/i.test(error.message));

      if (expiryRejected && remainingSeconds < MIN_CHECKOUT_LIFETIME_SECONDS) {
        await markAttempt(admin, attempt.id, { status: "expired" });
        continue;
      }
      throw error;
    }
  }

  throw new HttpError(409, {
    error: "Could not obtain a fresh Stripe Checkout reservation. Please retry.",
    checkoutInProgress: true,
  });
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
      billing_country?: unknown;
      terms_accepted?: unknown;
      recurring_billing_accepted?: unknown;
      immediate_service_requested?: unknown;
    };

    if (body.action === "healthcheck" || body.action === "integration_healthcheck") {
      if (!(await validCronSecret(request.headers.get("x-cron-secret")))) {
        return json({ error: "Forbidden." }, 403);
      }
      const runtime = inspectStripeRuntimeMode();
      if (!runtime.configured) return json({ error: "Stripe secret is not configured." }, 503);
      if (!runtime.allowed) {
        return json({
          error: runtime.label === "live_locked"
            ? "Stripe LIVE billing is locked pending explicit final launch approval."
            : "Stripe runtime configuration is invalid.",
          stripe_mode: runtime.label,
        }, 503);
      }
      if (body.action === "integration_healthcheck") return json(await runIntegrationHealthcheck());
      await stripeRequest("/account");
      return json({
        ok: true,
        stripe: "authenticated",
        stripe_api_version: STRIPE_RUNTIME_API_VERSION,
        stripe_mode: runtime.label,
      });
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

    const runtime = inspectStripeRuntimeMode();
    const configured = runtime.configured;
    if (body.action === "status") {
      return json({
        configured,
        stripe_api_version: STRIPE_RUNTIME_API_VERSION,
        stripe_mode: runtime.label,
        live_allowed: runtime.allowed && runtime.livemode === true,
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
    if (!runtime.allowed) {
      return json({
        error: runtime.label === "live_locked"
          ? "Stripe LIVE billing is locked pending explicit final launch approval."
          : "Stripe billing runtime configuration is invalid.",
        stripe_mode: runtime.label,
      }, 503);
    }

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
    if (body.billing_country !== LAUNCH_BILLING_COUNTRY) {
      return json({
        error: "Paid beta is currently available only for customers with a Polish billing address.",
        supported_billing_country: LAUNCH_BILLING_COUNTRY,
      }, 409);
    }
    if (body.terms_accepted !== true || body.recurring_billing_accepted !== true) {
      return json({ error: "Terms and recurring billing must be accepted before checkout." }, 400);
    }
    if (body.buyer_type === "individual" && body.immediate_service_requested !== true) {
      return json({ error: "Individuals must explicitly request immediate service before checkout." }, 400);
    }

    const existingSubscriptionNeedsPortal = Boolean(subscription.stripe_subscription_id) && subscription.status !== "canceled";
    const alreadyPaid = subscription.plan !== "free" &&
      (subscription.status === "active" || subscription.status === "trialing");
    if (existingSubscriptionNeedsPortal || alreadyPaid) {
      return json({
        error: "This workspace already has a Stripe subscription. Use Manage billing instead of creating another one.",
        usePortal: true,
      }, 409);
    }

    const admin = serviceClient();
    const checkout = await openOrResumeCheckout({
      admin,
      workspaceId: body.workspace_id,
      userId: authData.user.id,
      userEmail: authData.user.email ?? null,
      userAgent: request.headers.get("user-agent"),
      buyerType: body.buyer_type,
      plan: body.plan,
      period: body.period,
      stripeCustomerId: typeof subscription.stripe_customer_id === "string" ? subscription.stripe_customer_id : null,
    });

    return json({
      url: checkout.url,
      resumed: checkout.resumed,
      checkout_attempt_id: checkout.attemptId,
    });
  } catch (error) {
    if (error instanceof HttpError) return json(error.payload, error.status);
    console.error(error);
    const message = error instanceof Error ? error.message : "Unexpected billing error.";
    const status = /Stripe LIVE billing is locked|Stripe secret|runtime configuration/.test(message) ? 503 : 500;
    return json({ error: message }, status);
  }
});