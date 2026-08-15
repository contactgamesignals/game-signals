export const STRIPE_RUNTIME_API_VERSION = "2026-06-24.dahlia";

const STRIPE_TEST_KEY_PATTERN = /^(sk|rk)_test_[A-Za-z0-9_]+$/;
const STRIPE_LIVE_KEY_PATTERN = /^(sk|rk)_live_[A-Za-z0-9_]+$/;
const LIVE_UNLOCK_ENV = "GAMESIGNAL_STRIPE_LIVE_BILLING_UNLOCK";
const LIVE_UNLOCK_PHRASE = "I_UNDERSTAND_STRIPE_LIVE_BILLING_CAN_CHARGE_REAL_CUSTOMERS";

export type StripeRuntimeLabel =
  | "missing"
  | "invalid"
  | "sandbox"
  | "live_locked"
  | "live_explicitly_unlocked";

export type StripeRuntimeInspection = {
  configured: boolean;
  allowed: boolean;
  livemode: boolean | null;
  label: StripeRuntimeLabel;
};

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
  if (!secretKey) {
    return { configured: false, allowed: false, livemode: null, label: "missing" };
  }
  if (STRIPE_TEST_KEY_PATTERN.test(secretKey)) {
    return { configured: true, allowed: true, livemode: false, label: "sandbox" };
  }
  if (STRIPE_LIVE_KEY_PATTERN.test(secretKey)) {
    const unlocked = Deno.env.get(LIVE_UNLOCK_ENV) === LIVE_UNLOCK_PHRASE;
    return {
      configured: true,
      allowed: unlocked,
      livemode: true,
      label: unlocked ? "live_explicitly_unlocked" : "live_locked",
    };
  }
  return { configured: true, allowed: false, livemode: null, label: "invalid" };
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
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const object = value as Record<string, unknown>;
  if (typeof object.livemode === "boolean" && object.livemode !== expectedLivemode) {
    throw new Error(`${label} livemode does not match the configured Stripe runtime mode.`);
  }
  if (Array.isArray(object.data)) {
    for (const entry of object.data) assertStripePayloadMode(entry, expectedLivemode, label);
  }
}

export function stripeLiveBillingUnlockMetadata() {
  return {
    env: LIVE_UNLOCK_ENV,
    phrase: LIVE_UNLOCK_PHRASE,
  } as const;
}
