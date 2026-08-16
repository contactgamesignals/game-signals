export type BillingProvider = "stripe" | "paddle";

export function normalizeBillingProvider(value: unknown): BillingProvider {
  return value === "paddle" ? "paddle" : "stripe";
}

export function configuredBillingProvider(): BillingProvider {
  // Paddle is the default for new/free workspaces. Setting the environment
  // explicitly to `stripe` remains the rollback switch. Stored subscription
  // providers are normalized separately so historical Stripe subscriptions
  // never get reclassified just because the default changed.
  return process.env.GAMESIGNAL_BILLING_PROVIDER === "stripe" ? "stripe" : "paddle";
}

export const BILLING_PROVIDER_LABELS: Record<BillingProvider, string> = {
  stripe: "Stripe",
  paddle: "Paddle",
};
