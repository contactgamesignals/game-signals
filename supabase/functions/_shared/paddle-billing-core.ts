export type PaddleEnvironment = "sandbox" | "live";
export type PaddlePaidPlan = "indie" | "studio" | "publisher" | "crazy";
export type PaddleBillingPeriod = "monthly" | "yearly";
export type GameSignalSubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

const PADDLE_PAID_PLANS: PaddlePaidPlan[] = ["indie", "studio", "publisher", "crazy"];
const PADDLE_BILLING_PERIODS: PaddleBillingPeriod[] = ["monthly", "yearly"];

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
  crazy: {
    monthly: "PADDLE_PRICE_CRAZY_MONTHLY",
    yearly: "PADDLE_PRICE_CRAZY_YEARLY",
  },
};

export const PADDLE_SANDBOX_PRICE_IDS = {
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
} as const;

export const PADDLE_LIVE_PRICE_IDS = {
  indie: {
    monthly: "pri_01m06qqrjk6ta8d7jjw5wx4mmj",
    yearly: "pri_01m06qtfrzvft7e1j8xz6ewy19",
  },
  studio: {
    monthly: "pri_01m06rhvbg6c7rbvt7qbfe692s",
    yearly: "pri_01m06rn0qgc4apbw141fthamsf",
  },
  publisher: {
    monthly: "pri_01m06rqm0z6e330fwsefycd94c",
    yearly: "pri_01m06rssz63dvacvjs69d9jdh2",
  },
} as const;

export type PaddlePriceCatalogEntry = {
  priceId: string;
  plan: PaddlePaidPlan;
  period: PaddleBillingPeriod;
};

export function isPaddlePaidPlan(value: unknown): value is PaddlePaidPlan {
  return value === "indie" || value === "studio" || value === "publisher" || value === "crazy";
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
  for (const plan of PADDLE_PAID_PLANS) {
    for (const period of PADDLE_BILLING_PERIODS) {
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

function defaultPriceId(
  environment: PaddleEnvironment,
  plan: PaddlePaidPlan,
  period: PaddleBillingPeriod,
) {
  if (plan === "crazy") return undefined;
  const catalog = environment === "live" ? PADDLE_LIVE_PRICE_IDS : PADDLE_SANDBOX_PRICE_IDS;
  return catalog[plan][period];
}

export function buildPaddleRuntimePriceCatalog(
  environment: PaddleEnvironment,
  readEnv: (key: string) => string | undefined,
): PaddlePriceCatalogEntry[] {
  const entries: PaddlePriceCatalogEntry[] = [];
  for (const plan of PADDLE_PAID_PLANS) {
    for (const period of PADDLE_BILLING_PERIODS) {
      const key = PADDLE_PRICE_ENV_KEYS[plan][period];
      const configured = readEnv(key)?.trim();
      const priceId = configured || defaultPriceId(environment, plan, period);
      if (!priceId) continue;
      if (!/^pri_[a-z\d]{26}$/.test(priceId)) {
        throw new Error(`${key} is not a valid Paddle price ID.`);
      }
      entries.push({ priceId, plan, period });
    }
  }
  return entries;
}

export function paddleCatalogPlans(catalog: PaddlePriceCatalogEntry[]) {
  return PADDLE_PAID_PLANS.filter((plan) =>
    PADDLE_BILLING_PERIODS.every((period) => catalog.some((entry) => entry.plan === plan && entry.period === period)),
  );
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
