export type BillingProvider = "stripe" | "paddle";

export function normalizeBillingProvider(value: unknown): BillingProvider {
  return value === "paddle" ? "paddle" : "stripe";
}

export function configuredBillingProvider(): BillingProvider {
  return normalizeBillingProvider(process.env.GAMESIGNAL_BILLING_PROVIDER);
}

export const BILLING_PROVIDER_LABELS: Record<BillingProvider, string> = {
  stripe: "Stripe",
  paddle: "Paddle",
};
