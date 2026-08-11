export type PlanName = "free" | "indie" | "studio" | "publisher";

export const PLAN_LIMITS: Record<PlanName, { games: number; members: number }> = {
  free: { games: 1, members: 1 },
  indie: { games: 1, members: 1 },
  studio: { games: 3, members: 3 },
  publisher: { games: 10, members: 10 },
};

export function normalizePlan(value: string | null | undefined): PlanName {
  if (value === "indie" || value === "studio" || value === "publisher") {
    return value;
  }
  return "free";
}
