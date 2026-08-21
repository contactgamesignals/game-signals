export type PlanName = "free" | "indie" | "studio" | "publisher" | "crazy";
export type PaidPlanName = Exclude<PlanName, "free">;
export type BillingPeriod = "monthly" | "yearly";

export const PLAN_LIMITS: Record<PlanName, { games: number }> = {
  free: { games: 0 },
  indie: { games: 1 },
  studio: { games: 5 },
  publisher: { games: 15 },
  crazy: { games: 30 },
};

export const PLAN_LABELS: Record<PlanName, string> = {
  free: "No plan",
  indie: "Indie",
  studio: "Studio",
  publisher: "Publisher",
  crazy: "Crazy Dev / Big Publisher",
};

export function normalizePlan(value: unknown): PlanName {
  return value === "indie" || value === "studio" || value === "publisher" || value === "crazy" ? value : "free";
}

export function isPaidPlan(value: unknown): value is PaidPlanName {
  return value === "indie" || value === "studio" || value === "publisher" || value === "crazy";
}
