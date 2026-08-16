export type PaddleEnvironment = "sandbox" | "live";
export type PaddlePaidPlan = "indie" | "studio" | "publisher";
export type PaddleBillingPeriod = "monthly" | "yearly";
export type GameSignalSubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

export const PADDLE_PRICE_ENV_KEYS: Record<PaddlePaidPlan, Record<PaddleBillingPeriod, string>> = {
  indie: {
    monthly: "PADDLE_PRICE_INDIE_MONTHLY",
    yearly: "PADDLE_PRICE_INDIE_YEARLY",
  },
  studio: {
    monthly: "PADDLE_PRICE_STUDIO_MONTHLY",
    yearly: "PADDLE_PRICE_STUDIO_YEARLY",
  },
  publisher: {
    monthly: "PADDLE_PRICE_PUBLISHER_MONTHLY",
    yearly: "PADDLE_PRICE_PUBLISHER_YEARLY",
  },
};

// Sandbox price IDs are public Paddle catalog identifiers, not credentials.
// Keeping them here removes six manual runtime settings while still requiring
// separate environment variables for every LIVE price before LIVE can be enabled.
export const PADDLE_SANDBOX_PRICE_IDS: Record<PaddlePaidPlan, Record<PaddleBillingPeriod, string>> = {
  indie: {
    monthly: "pri_01m041w2rt1m5qm26yjygktnzj",
    yearly: "pri_01m04220y737wxhfphwbx7yscx",
  },
  studio: {
    monthly: "pri_01m0426yqh0mq79yz0z4dy1cf3",
    yearly: "pri_01m042a8vyffzzdeqeyqs1kj6t",
  },
  publisher: {
    monthly: "pri_01m042eynme90xtjwpsgpdbp33",
    yearly: "pri_01m042kp4p6r7baaea3w3pv7yb",
  },
};

export type PaddlePriceCatalogEntry = {
  priceId: string;
  plan: PaddlePaidPlan;
  period: PaddleBillingPeriod;
};

export function isPaddlePaidPlan(value: unknown): value is PaddlePaidPlan {
  return value === "indie" || value === "studio" || value === "publisher";
}

export function isPaddleBillingPeriod(value: unknown): value is PaddleBillingPeriod {
  return value === "monthly" || value === "yearly";
}

export function paddleApiBase(environment: PaddleEnvironment) {
  return environment === "live" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

export function resolvePaddleEnvironment(value: string | undefined): PaddleEnvironment {
  if (!value || value === "sandbox") return "sandbox";
  if (value === "live") return "live";
  throw new Error("PADDLE_ENV must be sandbox or live.");
}

export function validatePaddleApiKey(environment: PaddleEnvironment, apiKey: string | undefined) {
  if (!apiKey) throw new Error("Paddle API key is not configured.");
  if (environment === "sandbox" && !apiKey.startsWith("pdl_sdbx_apikey_")) {
    throw new Error("Paddle sandbox requires a sandbox API key.");
  }
  if (environment === "live" && !apiKey.startsWith("pdl_live_apikey_")) {
    throw new Error("Paddle LIVE requires a live API key.");
  }
  return apiKey;
}

export function assertPaddleCheckoutEnabled(input: {
  environment: PaddleEnvironment;
  billingEnabled: string | undefined;
  liveBillingEnabled: string | undefined;
}) {
  if (input.billingEnabled !== "true") {
    throw new Error("Paddle checkout is locked until PADDLE_BILLING_ENABLED=true.");
  }
  if (input.environment === "live" && input.liveBillingEnabled !== "true") {
    throw new Error("Paddle LIVE checkout is separately locked until PADDLE_LIVE_BILLING_ENABLED=true.");
  }
}

export function buildPaddlePriceCatalog(readEnv: (key: string) => string | undefined): PaddlePriceCatalogEntry[] {
  const entries: PaddlePriceCatalogEntry[] = [];
  for (const plan of ["indie", "studio", "publisher"] as const) {
    for (const period of ["monthly", "yearly"] as const) {
      const key = PADDLE_PRICE_ENV_KEYS[plan][period];
      const priceId = readEnv(key)?.trim();
      if (!priceId) continue;
      if (!/^pri_[a-z\d]{26}$/.test(priceId)) {
        throw new Error(`${key} is not a valid Paddle price ID.`);
      }
      entries.push({ priceId, plan, period });
    }
  }
  return entries;
}

export function buildPaddleRuntimePriceCatalog(
  environment: PaddleEnvironment,
  readEnv: (key: string) => string | undefined,
): PaddlePriceCatalogEntry[] {
  const entries: PaddlePriceCatalogEntry[] = [];
  for (const plan of ["indie", "studio", "publisher"] as const) {
    for (const period of ["monthly", "yearly"] as const) {
      const key = PADDLE_PRICE_ENV_KEYS[plan][period];
      const configured = readEnv(key)?.trim();
      const priceId = configured || (environment === "sandbox" ? PADDLE_SANDBOX_PRICE_IDS[plan][period] : undefined);
      if (!priceId) continue;
      if (!/^pri_[a-z\d]{26}$/.test(priceId)) {
        throw new Error(`${key} is not a valid Paddle price ID.`);
      }
      entries.push({ priceId, plan, period });
    }
  }
  return entries;
}

export function requirePaddlePrice(
  catalog: PaddlePriceCatalogEntry[],
  plan: PaddlePaidPlan,
  period: PaddleBillingPeriod,
) {
  const entry = catalog.find((candidate) => candidate.plan === plan && candidate.period === period);
  if (!entry) throw new Error(`Paddle price is not configured for ${plan}/${period}.`);
  return entry;
}

export function priceMetadata(catalog: PaddlePriceCatalogEntry[], priceId: unknown) {
  if (typeof priceId !== "string") return null;
  return catalog.find((entry) => entry.priceId === priceId) ?? null;
}

export function mapPaddleSubscriptionStatus(value: unknown): GameSignalSubscriptionStatus {
  if (value === "trialing" || value === "active" || value === "past_due" || value === "canceled") return value;
  if (value === "paused") return "past_due";
  return "incomplete";
}

export function paddleCancelAtPeriodEnd(scheduledChange: unknown) {
  if (!scheduledChange || typeof scheduledChange !== "object" || Array.isArray(scheduledChange)) return false;
  return (scheduledChange as Record<string, unknown>).action === "cancel";
}
