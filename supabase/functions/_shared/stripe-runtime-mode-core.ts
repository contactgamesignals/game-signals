export const STRIPE_LIVE_BILLING_UNLOCK_PHRASE = "I_UNDERSTAND_STRIPE_LIVE_BILLING_CAN_CHARGE_REAL_CUSTOMERS";

const STRIPE_TEST_KEY_PATTERN = /^(sk|rk)_test_[A-Za-z0-9_]+$/;
const STRIPE_LIVE_KEY_PATTERN = /^(sk|rk)_live_[A-Za-z0-9_]+$/;

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

export function inspectStripeRuntimeModeCore(
  secretKey: string | null | undefined,
  liveUnlock: string | null | undefined,
): StripeRuntimeInspection {
  const secret = secretKey?.trim() ?? "";
  if (!secret) {
    return { configured: false, allowed: false, livemode: null, label: "missing" };
  }
  if (STRIPE_TEST_KEY_PATTERN.test(secret)) {
    return { configured: true, allowed: true, livemode: false, label: "sandbox" };
  }
  if (STRIPE_LIVE_KEY_PATTERN.test(secret)) {
    const unlocked = liveUnlock === STRIPE_LIVE_BILLING_UNLOCK_PHRASE;
    return {
      configured: true,
      allowed: unlocked,
      livemode: true,
      label: unlocked ? "live_explicitly_unlocked" : "live_locked",
    };
  }
  return { configured: true, allowed: false, livemode: null, label: "invalid" };
}

export function assertStripePayloadModeCore(
  value: unknown,
  expectedLivemode: boolean,
  label = "Stripe object",
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const object = value as Record<string, unknown>;
  if (typeof object.livemode === "boolean" && object.livemode !== expectedLivemode) {
    throw new Error(`${label} livemode does not match the configured Stripe runtime mode.`);
  }
  if (Array.isArray(object.data)) {
    for (const entry of object.data) assertStripePayloadModeCore(entry, expectedLivemode, label);
  }
}
