import {
  assertStripePayloadModeCore,
  inspectStripeRuntimeModeCore,
  STRIPE_LIVE_BILLING_UNLOCK_PHRASE,
  type StripeRuntimeInspection,
  type StripeRuntimeLabel,
} from "./stripe-runtime-mode-core.ts";

export const STRIPE_RUNTIME_API_VERSION = "2026-06-24.dahlia";

const LIVE_UNLOCK_ENV = "GAMESIGNAL_STRIPE_LIVE_BILLING_UNLOCK";

export type { StripeRuntimeInspection, StripeRuntimeLabel };

export type StripeRuntimeMode = {
  secretKey: string;
  livemode: boolean;
  label: "sandbox" | "live_explicitly_unlocked";
  webhookVaultSecretName: "gamesignal_stripe_webhook_secret" | "gamesignal_stripe_live_webhook_secret";
};

function configuredSecret() {
  return Deno.env.get("STRIPE_SECRET_KEY")?.trim() ?? "";
}

export function inspectStripeRuntimeMode(secretKey = configuredSecret()): StripeRuntimeInspection {
  return inspectStripeRuntimeModeCore(secretKey, Deno.env.get(LIVE_UNLOCK_ENV));
}

export function requireStripeRuntimeMode(secretKey = configuredSecret()): StripeRuntimeMode {
  const inspection = inspectStripeRuntimeMode(secretKey);
  if (inspection.label === "missing") throw new Error("Stripe secret is not configured.");
  if (inspection.label === "invalid") throw new Error("Stripe secret key format is not recognized.");
  if (inspection.label === "live_locked") {
    throw new Error("Stripe LIVE billing is locked pending explicit final launch approval.");
  }
  if (!inspection.allowed || inspection.livemode === null) {
    throw new Error("Stripe runtime mode is not allowed.");
  }
  return {
    secretKey,
    livemode: inspection.livemode,
    label: inspection.livemode ? "live_explicitly_unlocked" : "sandbox",
    webhookVaultSecretName: inspection.livemode
      ? "gamesignal_stripe_live_webhook_secret"
      : "gamesignal_stripe_webhook_secret",
  };
}

export function assertStripePayloadMode(value: unknown, expectedLivemode: boolean, label = "Stripe object") {
  assertStripePayloadModeCore(value, expectedLivemode, label);
}

export function stripeLiveBillingUnlockMetadata() {
  return {
    env: LIVE_UNLOCK_ENV,
    phrase: STRIPE_LIVE_BILLING_UNLOCK_PHRASE,
  } as const;
}
