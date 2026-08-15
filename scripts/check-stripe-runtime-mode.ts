import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertStripePayloadModeCore,
  inspectStripeRuntimeModeCore,
  STRIPE_LIVE_BILLING_UNLOCK_PHRASE,
} from "../supabase/functions/_shared/stripe-runtime-mode-core.ts";

const wrapper = readFileSync("supabase/functions/_shared/stripe-runtime-mode.ts", "utf8");

const sandbox = inspectStripeRuntimeModeCore("sk_test_example_123", undefined);
assert.deepEqual(sandbox, {
  configured: true,
  allowed: true,
  livemode: false,
  label: "sandbox",
});

const restrictedSandbox = inspectStripeRuntimeModeCore("rk_test_example_123", STRIPE_LIVE_BILLING_UNLOCK_PHRASE);
assert.equal(restrictedSandbox.label, "sandbox");
assert.equal(restrictedSandbox.livemode, false);
assert.equal(restrictedSandbox.allowed, true);

const lockedLive = inspectStripeRuntimeModeCore("sk_live_example_123", undefined);
assert.deepEqual(lockedLive, {
  configured: true,
  allowed: false,
  livemode: true,
  label: "live_locked",
});

const wrongUnlockLive = inspectStripeRuntimeModeCore("rk_live_example_123", "almost");
assert.equal(wrongUnlockLive.label, "live_locked");
assert.equal(wrongUnlockLive.allowed, false);

const explicitLive = inspectStripeRuntimeModeCore(
  "sk_live_example_123",
  STRIPE_LIVE_BILLING_UNLOCK_PHRASE,
);
assert.deepEqual(explicitLive, {
  configured: true,
  allowed: true,
  livemode: true,
  label: "live_explicitly_unlocked",
});

assert.deepEqual(inspectStripeRuntimeModeCore("", undefined), {
  configured: false,
  allowed: false,
  livemode: null,
  label: "missing",
});
assert.deepEqual(inspectStripeRuntimeModeCore("pk_test_not_server_secret", undefined), {
  configured: true,
  allowed: false,
  livemode: null,
  label: "invalid",
});
assert.deepEqual(inspectStripeRuntimeModeCore("sk_test_", undefined), {
  configured: true,
  allowed: false,
  livemode: null,
  label: "invalid",
});

assert.doesNotThrow(() => assertStripePayloadModeCore({ livemode: false }, false));
assert.doesNotThrow(() => assertStripePayloadModeCore({ data: [{ livemode: false }] }, false));
assert.throws(
  () => assertStripePayloadModeCore({ livemode: true }, false, "event"),
  /event livemode does not match/,
);
assert.throws(
  () => assertStripePayloadModeCore({ data: [{ livemode: false }] }, true, "list"),
  /list livemode does not match/,
);

assert.match(wrapper, /inspectStripeRuntimeModeCore/);
assert.match(wrapper, /assertStripePayloadModeCore/);
assert.match(wrapper, /GAMESIGNAL_STRIPE_LIVE_BILLING_UNLOCK/);
assert.match(wrapper, /gamesignal_stripe_webhook_secret/);
assert.match(wrapper, /gamesignal_stripe_live_webhook_secret/);
assert.match(wrapper, /live_locked/);
assert.match(wrapper, /Stripe LIVE billing is locked pending explicit final launch approval/);
assert.doesNotMatch(wrapper, /STRIPE_TEST_KEY_PATTERN/);
assert.doesNotMatch(wrapper, /STRIPE_LIVE_KEY_PATTERN/);

console.log("Stripe TEST/LIVE runtime mode is behavior-tested and fail-closed.");
