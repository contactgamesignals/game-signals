import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assertPaddleCheckoutEnabled,
  buildPaddleRuntimePriceCatalog,
  isPaddleBillingPeriod,
  isPaddlePaidPlan,
  paddleApiBase,
  paddleCatalogPlans,
  priceMetadata,
  requirePaddlePrice,
  resolvePaddleEnvironment,
  validatePaddleApiKey,
  type PaddleBillingPeriod,
  type PaddlePaidPlan,
  type PaddlePriceCatalogEntry,
} from "../_shared/paddle-billing-core.ts";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLIC_SITE_URL = "https://www.whoplaysmygame.com";
const PADDLE_LIVE_CHECKOUT_URL = "https://whoplaysmygame.com/pay";
const TERMS_VERSION = "2026-08-17-v1";
const PRIVACY_VERSION = "2026-08-17-v1";
const CHANGE_LOCK_WINDOW_MS = 30 * 60 * 1000;

const PLAN_RANK: Record<PaddlePaidPlan, number> = {
  indie: 1,
  studio: 2,
  publisher: 3,
  crazy: 4,
};

const PLAN_GAME_LIMIT: Record<PaddlePaidPlan, number> = {
  indie: 1,
  studio: 5,
  publisher: 15,
  crazy: 30,
};

type BuyerType = "individual" | "company";
type PaddleEnvironment = "sandbox" | "live";
type PaddleObject = Record<string, unknown>;
type PlanChangeTiming = "immediate" | "next_billing_period";

type StoredSubscription = {
  plan: unknown;
  status: unknown;
  billing_provider: unknown;
  billing_environment: unknown;
  billing_customer_id: unknown;
  billing_subscription_id: unknown;
  billing_period: unknown;
  current_period_end: unknown;
  cancel_at_period_end: unknown;
  pending_plan: unknown;
  pending_plan_effective_at: unknown;
  pending_plan_requested_at: unknown;
};

type PlanChangeContext = {
  paddleSubscription: PaddleObject;
  currentPlan: PaddlePaidPlan;
  targetPlan: PaddlePaidPlan;
  period: PaddleBillingPeriod;
  timing: PlanChangeTiming;
  isUpgrade: boolean;
  isDowngrade: boolean;
  nextBilledAt: string;
  items: Array<{ price_id: string; quantity: number }>;
  customData: PaddleObject;
  activeGames: number;
  targetLimit: number;
  prorationBillingMode: "prorated_immediately" | "full_next_billing_period";
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function objectValue(value: unknown): PaddleObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PaddleObject : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown, fallback = 1) {
  return typeof value === "number" && Number.isFinite(value) && value >= 1 ? value : fallback;
}

function isBuyerType(value: unknown): value is BuyerType {
  return value === "individual" || value === "company";
}

function isPlanChangeTiming(value: unknown): value is PlanChangeTiming {
  return value === "immediate" || value === "next_billing_period";
}

function canonicalSiteUrl() {
  const configured = Deno.env.get("GAMESIGNAL_SITE_URL")?.trim().replace(/\/+$/, "");
  if (!configured || configured.includes("game-signals.vercel.app")) return PUBLIC_SITE_URL;
  return configured;
}

function paddleCheckoutUrl() {
  const configured = Deno.env.get("PADDLE_CHECKOUT_URL")?.trim();
  if (configured && !configured.includes("game-signals.vercel.app")) return configured;
  const environment = resolvePaddleEnvironment(Deno.env.get("PADDLE_ENV") ?? undefined);
  return environment === "live" ? PADDLE_LIVE_CHECKOUT_URL : `${canonicalSiteUrl()}/pay`;
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service environment is missing.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function paddleApiRuntime(environment: PaddleEnvironment) {
  const apiKeyName = environment === "live" ? "PADDLE_LIVE_API_KEY" : "PADDLE_API_KEY";
  const apiKey = validatePaddleApiKey(environment, Deno.env.get(apiKeyName) ?? undefined);
  return { environment, apiKey, baseUrl: paddleApiBase(environment) };
}

function paddleRuntime() {
  const environment = resolvePaddleEnvironment(Deno.env.get("PADDLE_ENV") ?? undefined);
  const apiRuntime = paddleApiRuntime(environment);
  const catalog = buildPaddleRuntimePriceCatalog(environment, (key) => Deno.env.get(key) ?? undefined);
  return { ...apiRuntime, catalog };
}

async function paddleRequest(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH"; body?: unknown } = {},
  environmentOverride?: PaddleEnvironment,
) {
  const runtime = environmentOverride ? paddleApiRuntime(environmentOverride) : paddleRuntime();
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

function transactionMoney(value: unknown, fallbackCurrency: string) {
  const transaction = objectValue(value);
  if (!transaction) return null;
  const details = objectValue(transaction.details);
  const totals = objectValue(details?.totals);
  const amount = stringValue(totals?.total);
  const currency = stringValue(transaction.currency_code) ?? fallbackCurrency;
  if (!amount) return null;
  return { amount, currency };
}

function recurringMoney(value: unknown, fallbackCurrency: string) {
  const details = objectValue(value);
  if (!details) return null;
  const totals = objectValue(details.totals);
  const amount = stringValue(totals?.total);
  if (!amount) return null;
  return { amount, currency: fallbackCurrency };
}

function basePlanFromSubscription(
  paddleSubscription: PaddleObject,
  catalog: PaddlePriceCatalogEntry[],
) {
  const items = Array.isArray(paddleSubscription.items) ? paddleSubscription.items : [];
  const matches: Array<{ plan: PaddlePaidPlan; period: PaddleBillingPeriod; priceId: string }> = [];
  for (const itemValue of items) {
    const item = objectValue(itemValue);
    const price = objectValue(item?.price);
    const priceId = stringValue(price?.id);
    if (!priceId) continue;
    const metadata = priceMetadata(catalog, priceId);
    if (metadata) matches.push({ plan: metadata.plan, period: metadata.period, priceId });
  }
  if (matches.length !== 1) {
    throw new Error("The Paddle subscription does not have exactly one recognized Who Plays My Game base plan.");
  }
  return matches[0];
}

function planChangeItems(
  paddleSubscription: PaddleObject,
  catalog: PaddlePriceCatalogEntry[],
  targetPriceId: string,
) {
  const items = Array.isArray(paddleSubscription.items) ? paddleSubscription.items : [];
  let replaced = 0;
  const nextItems: Array<{ price_id: string; quantity: number }> = [];

  for (const itemValue of items) {
    const item = objectValue(itemValue);
    const price = objectValue(item?.price);
    const priceId = stringValue(price?.id);
    if (!priceId) continue;
    if (priceMetadata(catalog, priceId)) {
      replaced += 1;
      nextItems.push({ price_id: targetPriceId, quantity: numberValue(item?.quantity) });
    } else {
      nextItems.push({ price_id: priceId, quantity: numberValue(item?.quantity) });
    }
  }

  if (replaced !== 1) {
    throw new Error("Could not safely identify the current base plan on this Paddle subscription.");
  }
  return nextItems;
}

async function preparePlanChange(input: {
  body: { plan?: unknown; change_timing?: unknown; workspace_id: string };
  subscription: StoredSubscription;
  runtime: ReturnType<typeof paddleRuntime>;
  storedPaddleEnvironment: PaddleEnvironment | null;
}) {
  const { body, subscription, runtime, storedPaddleEnvironment } = input;
  if (!storedPaddleEnvironment || !subscription.billing_subscription_id) {
    throw new Error("A Paddle subscription is required to change plans.");
  }
  if (subscription.status !== "active" && subscription.status !== "trialing") {
    throw new Error("Plan changes are available only for an active subscription.");
  }
  if (subscription.pending_plan) {
    throw new Error("A plan change is already scheduled for the next renewal.");
  }
  if (!isPaddlePaidPlan(body.plan)) throw new Error("Choose a valid paid plan.");
  if (!isPlanChangeTiming(body.change_timing)) throw new Error("Choose when the plan change should take effect.");

  const subscriptionId = String(subscription.billing_subscription_id);
  const response = await paddleRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {}, storedPaddleEnvironment);
  const paddleSubscription = objectValue(response.data);
  if (!paddleSubscription) throw new Error("Paddle did not return the current subscription.");

  if (objectValue(paddleSubscription.scheduled_change)) {
    throw new Error("This subscription already has a scheduled pause or cancellation. Remove that scheduled change before changing plans.");
  }

  const currentBase = basePlanFromSubscription(paddleSubscription, runtime.catalog);
  if (!isPaddlePaidPlan(subscription.plan) || currentBase.plan !== subscription.plan) {
    throw new Error("Billing is still synchronizing. Refresh this page in a moment before changing plans.");
  }
  if (body.plan === currentBase.plan) throw new Error("This is already your current plan.");

  const isUpgrade = PLAN_RANK[body.plan] > PLAN_RANK[currentBase.plan];
  const isDowngrade = PLAN_RANK[body.plan] < PLAN_RANK[currentBase.plan];
  if (isDowngrade && body.change_timing !== "next_billing_period") {
    throw new Error("Downgrades take effect on the next renewal.");
  }

  const nextBilledAt = stringValue(paddleSubscription.next_billed_at) ?? stringValue(subscription.current_period_end);
  if (!nextBilledAt) throw new Error("Paddle did not return the next billing date.");
  const nextBillingTime = Date.parse(nextBilledAt);
  if (!Number.isFinite(nextBillingTime) || nextBillingTime - Date.now() <= CHANGE_LOCK_WINDOW_MS) {
    throw new Error("This subscription is too close to renewal to change plans safely. Try again after the renewal finishes.");
  }

  const targetPrice = requirePaddlePrice(runtime.catalog, body.plan, currentBase.period);
  const items = planChangeItems(paddleSubscription, runtime.catalog, targetPrice.priceId);
  const existingCustomData = objectValue(paddleSubscription.custom_data) ?? {};
  const customData: PaddleObject = {
    ...existingCustomData,
    gamesignal: "true",
    product: "who-plays-my-game",
    workspace_id: body.workspace_id,
    plan: body.plan,
    billing_period: currentBase.period,
  };

  const admin = serviceClient();
  const { count, error: countError } = await admin
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", body.workspace_id)
    .eq("enabled", true);
  if (countError) throw new Error("Could not verify the number of active games before changing plans.");
  const activeGames = count ?? 0;
  const targetLimit = PLAN_GAME_LIMIT[body.plan];
  if (isDowngrade && activeGames > targetLimit) {
    const gamesToPause = activeGames - targetLimit;
    const error = new Error(`Pause ${gamesToPause} active game${gamesToPause === 1 ? "" : "s"} before scheduling this downgrade.`);
    Object.assign(error, { blockedPlanChange: { activeGames, targetLimit, gamesToPause } });
    throw error;
  }

  return {
    paddleSubscription,
    currentPlan: currentBase.plan,
    targetPlan: body.plan,
    period: currentBase.period,
    timing: body.change_timing,
    isUpgrade,
    isDowngrade,
    nextBilledAt,
    items,
    customData,
    activeGames,
    targetLimit,
    prorationBillingMode: body.change_timing === "immediate" ? "prorated_immediately" : "full_next_billing_period",
  } satisfies PlanChangeContext;
}

function planChangeResponse(context: PlanChangeContext, previewData: PaddleObject) {
  const currency = stringValue(context.paddleSubscription.currency_code) ?? "USD";
  const immediate = transactionMoney(previewData.immediate_transaction, currency) ?? { amount: "0", currency };
  const next = transactionMoney(previewData.next_transaction, currency) ?? recurringMoney(previewData.recurring_transaction_details, currency);
  return {
    current_plan: context.currentPlan,
    target_plan: context.targetPlan,
    billing_period: context.period,
    change_timing: context.timing,
    change_type: context.isUpgrade ? "upgrade" : "downgrade",
    next_billed_at: context.nextBilledAt,
    active_games: context.activeGames,
    target_limit: context.targetLimit,
    amount_due_now: immediate,
    next_amount: next,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const body = await request.json().catch(() => ({})) as {
      action?: "status" | "checkout" | "portal" | "change_preview" | "change_plan";
      workspace_id?: string;
      plan?: unknown;
      period?: unknown;
      change_timing?: unknown;
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
        .select("plan, status, billing_provider, billing_environment, billing_customer_id, billing_subscription_id, billing_period, current_period_end, cancel_at_period_end, pending_plan, pending_plan_effective_at, pending_plan_requested_at")
        .eq("workspace_id", body.workspace_id)
        .maybeSingle(),
    ]);

    if (membershipError || !membership) return json({ error: "Forbidden." }, 403);
    if (subscriptionError || !subscription) return json({ error: "Subscription record not found." }, 404);

    let runtimeConfigured = false;
    let environment: PaddleEnvironment = "sandbox";
    let availablePlans: string[] = [];
    try {
      const runtime = paddleRuntime();
      environment = runtime.environment;
      availablePlans = paddleCatalogPlans(runtime.catalog);
      runtimeConfigured = ["indie", "studio", "publisher"].every((plan) => availablePlans.includes(plan));
    } catch {
      runtimeConfigured = false;
      availablePlans = [];
    }

    const billingEnabled = Deno.env.get("PADDLE_BILLING_ENABLED") === "true";
    const liveBillingEnabled = Deno.env.get("PADDLE_LIVE_BILLING_ENABLED") === "true";
    const sandboxCheckoutEnabled = Deno.env.get("PADDLE_SANDBOX_CHECKOUT_ENABLED") === "true";
    const checkoutEnabled = runtimeConfigured && billingEnabled &&
      (environment === "live" ? liveBillingEnabled : sandboxCheckoutEnabled);
    const storedPaddleEnvironment: PaddleEnvironment | null = subscription.billing_provider === "paddle" &&
      (subscription.billing_environment === "sandbox" || subscription.billing_environment === "live")
      ? subscription.billing_environment
      : null;
    const storedPaddleIdentity = storedPaddleEnvironment !== null;
    const currentPaddleIdentity = storedPaddleEnvironment === environment;

    if (body.action === "status") {
      return json({
        configured: checkoutEnabled,
        checkout_enabled: checkoutEnabled,
        provider: "paddle",
        paddle_mode: environment,
        available_plans: availablePlans,
        plan: subscription.plan ?? "free",
        status: subscription.status ?? "trialing",
        billing_period: subscription.billing_period ?? null,
        current_period_end: subscription.current_period_end ?? null,
        pending_plan: subscription.pending_plan ?? null,
        pending_plan_effective_at: subscription.pending_plan_effective_at ?? null,
        has_customer: storedPaddleIdentity && Boolean(subscription.billing_customer_id),
        has_subscription: storedPaddleIdentity && Boolean(subscription.billing_subscription_id),
        customer_environment: storedPaddleEnvironment,
      });
    }

    if (membership.role !== "owner" && membership.role !== "admin") {
      return json({ error: "Only workspace owners and admins can manage billing." }, 403);
    }

    const runtime = paddleRuntime();
    const runtimePlans = paddleCatalogPlans(runtime.catalog);
    if (!["indie", "studio", "publisher"].every((plan) => runtimePlans.includes(plan))) {
      return json({ error: "The core Paddle plan prices must be configured before billing is enabled." }, 503);
    }

    if (body.action === "portal") {
      if (!storedPaddleEnvironment || !subscription.billing_customer_id) {
        return json({ error: "No Paddle customer exists for this workspace yet." }, 409);
      }
      const subscriptionIds = subscription.billing_subscription_id ? [String(subscription.billing_subscription_id)] : [];
      const portal = await paddleRequest(`/customers/${encodeURIComponent(String(subscription.billing_customer_id))}/portal-sessions`, {
        method: "POST",
        body: subscriptionIds.length ? { subscription_ids: subscriptionIds } : {},
      }, storedPaddleEnvironment);
      const data = objectValue(portal.data);
      const urls = objectValue(data?.urls);
      const general = objectValue(urls?.general);
      if (typeof general?.overview !== "string") throw new Error("Paddle did not return a customer portal URL.");
      return json({ url: general.overview, provider: "paddle", paddle_mode: storedPaddleEnvironment });
    }

    if (body.action === "change_preview" || body.action === "change_plan") {
      if (!currentPaddleIdentity) return json({ error: "Plan changes are available for the current Paddle subscription only." }, 409);
      try {
        const context = await preparePlanChange({
          body: { plan: body.plan, change_timing: body.change_timing, workspace_id: body.workspace_id },
          subscription: subscription as StoredSubscription,
          runtime,
          storedPaddleEnvironment,
        });
        const preview = await paddleRequest(`/subscriptions/${encodeURIComponent(String(subscription.billing_subscription_id))}/preview`, {
          method: "PATCH",
          body: {
            items: context.items,
            proration_billing_mode: context.prorationBillingMode,
            on_payment_failure: "prevent_change",
          },
        }, storedPaddleEnvironment);
        const previewData = objectValue(preview.data);
        if (!previewData) throw new Error("Paddle did not return a plan change preview.");
        const summary = planChangeResponse(context, previewData);

        if (body.action === "change_preview") return json({ ...summary, preview: true });

        const admin = serviceClient();
        if (context.timing === "next_billing_period") {
          const { error: pendingError } = await admin
            .from("subscriptions")
            .update({
              pending_plan: context.targetPlan,
              pending_plan_effective_at: context.nextBilledAt,
              pending_plan_requested_at: new Date().toISOString(),
            })
            .eq("workspace_id", body.workspace_id)
            .is("pending_plan", null);
          if (pendingError) throw new Error("Could not reserve the scheduled plan change.");
        }

        try {
          const updated = await paddleRequest(`/subscriptions/${encodeURIComponent(String(subscription.billing_subscription_id))}`, {
            method: "PATCH",
            body: {
              items: context.items,
              custom_data: context.customData,
              proration_billing_mode: context.prorationBillingMode,
              on_payment_failure: "prevent_change",
            },
          }, storedPaddleEnvironment);
          if (!objectValue(updated.data)) throw new Error("Paddle did not confirm the subscription update.");
        } catch (updateError) {
          if (context.timing === "next_billing_period") {
            try {
              const check = await paddleRequest(`/subscriptions/${encodeURIComponent(String(subscription.billing_subscription_id))}`, {}, storedPaddleEnvironment);
              const checkData = objectValue(check.data);
              const checkBase = checkData ? basePlanFromSubscription(checkData, runtime.catalog) : null;
              if (!checkBase || checkBase.plan !== context.targetPlan) {
                await admin
                  .from("subscriptions")
                  .update({ pending_plan: null, pending_plan_effective_at: null, pending_plan_requested_at: null })
                  .eq("workspace_id", body.workspace_id)
                  .eq("pending_plan", context.targetPlan);
              }
            } catch {
              // Keep pending state when the external result is ambiguous. A later webhook can reconcile it safely.
            }
          }
          throw updateError;
        }

        return json({
          ...summary,
          applied: true,
          scheduled: context.timing === "next_billing_period",
          message: context.timing === "immediate"
            ? "Your upgrade is being applied now. Paddle will charge only the prorated difference shown above."
            : `Your plan change is scheduled for ${context.nextBilledAt}. Your current plan stays active until that renewal.`,
        });
      } catch (planChangeError) {
        const blocked = (planChangeError as Error & { blockedPlanChange?: unknown }).blockedPlanChange;
        if (blocked) {
          return json({ error: planChangeError instanceof Error ? planChangeError.message : "Pause games before downgrading.", blocked: true, ...blocked as PaddleObject }, 409);
        }
        throw planChangeError;
      }
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

    const existingPaddleSubscriptionNeedsPortal = currentPaddleIdentity &&
      Boolean(subscription.billing_subscription_id) && subscription.status !== "canceled";
    const alreadyPaid = subscription.plan !== "free" &&
      (subscription.status === "active" || subscription.status === "trialing");
    if (existingPaddleSubscriptionNeedsPortal || alreadyPaid) {
      return json({ error: "This workspace already has a paid subscription. Use Change plan or Manage billing.", usePortal: true }, 409);
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
