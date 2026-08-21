export type PlanName = "free" | "indie" | "studio" | "publisher" | "crazy";
export type PaidPlanName = Exclude<PlanName, "free">;
export type BillingPeriod = "monthly" | "yearly";

export const PLAN_LIMITS: Record<PlanName, { games: number; members: number }> = {
  free: { games: 0, members: 1 },
  indie: { games: 1, members: 10 },
  studio: { games: 5, members: 10 },
  publisher: { games: 15, members: 10 },
  crazy: { games: 30, members: 10 },
};

export const PLAN_LABELS: Record<PlanName, string> = {
  free: "Free",
  indie: "Indie",
  studio: "Studio",
  publisher: "Publisher",
  crazy: "Crazy Dev / Big Publisher",
};

export const STRIPE_PRICE_LOOKUP_KEYS: Record<PaidPlanName, Record<BillingPeriod, string>> = {
  indie: {
    monthly: "gamesignal_indie_monthly",
    yearly: "gamesignal_indie_yearly",
  },
  studio: {
    monthly: "gamesignal_studio_monthly",
    yearly: "gamesignal_studio_yearly",
  },
  publisher: {
    monthly: "gamesignal_publisher_monthly",
    yearly: "gamesignal_publisher_yearly",
  },
  crazy: {
    monthly: "gamesignal_crazy_monthly",
    yearly: "gamesignal_crazy_yearly",
  },
};

export function normalizePlan(value: string | null | undefined): PlanName {
  if (value === "indie" || value === "studio" || value === "publisher" || value === "crazy") {
    return value;
  }
  return "free";
}

export function isPaidPlan(value: unknown): value is PaidPlanName {
  return value === "indie" || value === "studio" || value === "publisher" || value === "crazy";
}

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return value === "monthly" || value === "yearly";
}
