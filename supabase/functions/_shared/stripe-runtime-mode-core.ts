export const STRIPE_LIVE_BILLING_UNLOCK_PHRASE = "I_UNDERSTAND_STRIPE_LIVE_BILLING_CAN_CHARGE_REAL_CUSTOMERS";

export type StripeRuntimeDescriptor = {
  mode: "test" | "live" | "live_locked";
  livemode: boolean;
  liveAllowed: boolean;
};

export function inspectStripeRuntimeModeCore(
  secretKey: string | null | undefined,
  liveUnlock: string | null | undefined,
): StripeRuntimeDescriptor {
  const secret = secretKey?.trim() ?? "";
  if (/^(sk|rk)_test_/.test(secret)) {
    return { mode: "test", livemode: false, liveAllowed: false };
  }
  if (/^(sk|rk)_live_/.test(secret)) {
    const liveAllowed = liveUnlock === STRIPE_LIVE_BILLING_UNLOCK_PHRASE;
    return {
      mode: liveAllowed ? "live" : "live_locked",
      livemode: true,
      liveAllowed,
    };
  }
  throw new Error("Stripe secret is missing or has an unsupported mode.");
}

export function assertStripePayloadModeCore(
  value: unknown,
  expectedLivemode: boolean,
  label = "Stripe payload",
) {
  if (!value || typeof value !== "object") return;

  const stack: unknown[] = [value];
  const seen = new Set<unknown>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object" || seen.has(current)) continue;
    seen.add(current);

    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }

    const record = current as Record<string, unknown>;
    if (typeof record.livemode === "boolean" && record.livemode !== expectedLivemode) {
      throw new Error(`${label} livemode does not match the configured Stripe runtime.`);
    }

    for (const nested of Object.values(record)) {
      if (nested && typeof nested === "object") stack.push(nested);
    }
  }
}
