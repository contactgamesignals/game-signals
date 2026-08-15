import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const billing = readFileSync("supabase/functions/stripe-billing-v11-draft/index.ts", "utf8");
const runtime = readFileSync("supabase/functions/_shared/stripe-runtime-mode.ts", "utf8");

assert.match(billing, /requireStripeRuntimeMode/);
assert.match(billing, /inspectStripeRuntimeMode/);
assert.match(billing, /assertStripePayloadMode/);
assert.match(billing, /STRIPE_RUNTIME_API_VERSION/);
assert.doesNotMatch(billing, /STRIPE_TEST_KEY_PATTERN/);
assert.doesNotMatch(billing, /STRIPE_LIVE_KEY_PATTERN/);
assert.doesNotMatch(billing, /const STRIPE_API_VERSION/);
assert.doesNotMatch(billing, /sk_live_[A-Za-z0-9]{8,}/);
assert.doesNotMatch(billing, /sk_test_[A-Za-z0-9]{8,}/);

assert.match(billing, /Authorization:\s*`Bearer \$\{stripeMode\.secretKey\}`/);
assert.match(billing, /"Stripe-Version": STRIPE_RUNTIME_API_VERSION/);
assert.match(billing, /assertStripePayloadMode\(payload, stripeMode\.livemode, `Stripe API \$\{options\.method \?\? "GET"\} \$\{path\}`\)/);

// Status may report the configured runtime, but every mutating/management path
// must fail closed when the shared runtime is not explicitly allowed.
assert.match(billing, /const runtime = inspectStripeRuntimeMode\(\)/);
assert.match(billing, /stripe_mode: runtime\.label/);
assert.match(billing, /live_allowed: runtime\.allowed && runtime\.livemode === true/);
assert.match(billing, /if \(!runtime\.allowed\)[\s\S]*Stripe LIVE billing is locked pending explicit final launch approval/);

// The integration healthcheck deliberately remains TEST-only even after the
// shared runtime supports a future explicitly unlocked LIVE mode.
assert.match(billing, /async function runIntegrationHealthcheck\(\)[\s\S]*if \(stripeMode\.livemode\)[\s\S]*sandbox-only and is never run against LIVE/);
const integrationGuardAt = billing.indexOf("if (stripeMode.livemode)");
const healthcheckCheckoutAt = billing.indexOf('stripeRequest("/checkout/sessions"', integrationGuardAt);
assert.ok(integrationGuardAt >= 0, "LIVE integration-healthcheck guard missing");
assert.ok(healthcheckCheckoutAt > integrationGuardAt, "healthcheck LIVE guard must run before creating a Checkout Session");

// Preserve the existing legal/commercial Checkout safeguards.
assert.match(billing, /LAUNCH_BILLING_COUNTRY = "PL"/);
assert.match(billing, /body\.billing_country !== LAUNCH_BILLING_COUNTRY/);
assert.match(billing, /terms_accepted !== true \|\| body\.recurring_billing_accepted !== true/);
assert.match(billing, /body\.buyer_type === "individual" && body\.immediate_service_requested !== true/);
assert.match(billing, /reserve_subscription_checkout/);
assert.match(billing, /getOrCreateConsent/);
assert.match(billing, /freezeAttemptStripeParameters/);
assert.match(billing, /gamesignal-checkout-\$\{attempt\.id\}/);
assert.match(billing, /Idempotency-Key/);
assert.match(billing, /automatic_tax\[enabled\].*true/);
assert.match(billing, /tax_id_collection\[enabled\].*true/);
assert.match(billing, /metadata\[declared_billing_country\]/);
assert.match(billing, /subscription_data\[metadata\]\[declared_billing_country\]/);

const countryGateAt = billing.indexOf("body.billing_country !== LAUNCH_BILLING_COUNTRY");
const reserveCallAt = billing.lastIndexOf("const admin = serviceClient();");
assert.ok(countryGateAt >= 0 && reserveCallAt > countryGateAt, "Poland-only gate must precede checkout reservation");

// The shared helper remains the single source of truth for the exact global
// LIVE billing arm. The draft must not recreate that phrase locally.
assert.match(runtime, /GAMESIGNAL_STRIPE_LIVE_BILLING_UNLOCK/);
assert.match(runtime, /requireStripeRuntimeMode/);
assert.doesNotMatch(billing, /I_UNDERSTAND_STRIPE_LIVE_BILLING_CAN_CHARGE_REAL_CUSTOMERS/);

console.log("Stripe billing v11 draft uses the shared fail-closed runtime without weakening Checkout/Portal safeguards.");
