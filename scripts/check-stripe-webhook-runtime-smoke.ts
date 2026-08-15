import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const smoke = readFileSync("supabase/functions/stripe-webhook-runtime-smoke/index.ts", "utf8");

assert.match(smoke, /requireStripeRuntimeMode/);
assert.match(smoke, /assertStripePayloadMode/);
assert.match(smoke, /stripeMode\.webhookVaultSecretName/);
assert.match(smoke, /get_internal_vault_secret/);
assert.match(smoke, /verifyStripeSignature/);
assert.match(smoke, /stripe-signature/);
assert.match(smoke, /typeof event\.livemode !== "boolean"/);
assert.match(smoke, /typeof object\.livemode !== "boolean"/);
assert.match(smoke, /assertStripePayloadMode\(event, stripeMode\.livemode/);
assert.match(smoke, /assertStripePayloadMode\(object, stripeMode\.livemode/);
assert.match(smoke, /Webhook runtime smoke test is intentionally sandbox-only/);
assert.match(smoke, /mode:\s*"signature_and_livemode_check_only"/);
assert.match(smoke, /mutation_performed:\s*false/);

// This smoke endpoint verifies only the signed webhook boundary. It must not
// execute any of the billing/accounting mutation paths used by the real webhook.
assert.doesNotMatch(smoke, /billing_invoice_records/);
assert.doesNotMatch(smoke, /billing_adjustment_records/);
assert.doesNotMatch(smoke, /billing_location_evidence/);
assert.doesNotMatch(smoke, /billing_dispute_records/);
assert.doesNotMatch(smoke, /apply_subscription_stripe_event/);
assert.doesNotMatch(smoke, /\.insert\(/);
assert.doesNotMatch(smoke, /\.update\(/);
assert.doesNotMatch(smoke, /\.upsert\(/);
assert.doesNotMatch(smoke, /checkout\/sessions/);
assert.doesNotMatch(smoke, /billing_portal/);
assert.doesNotMatch(smoke, /Deno\.env\.set\(/);
assert.doesNotMatch(smoke, /sk_live_[A-Za-z0-9]/);
assert.doesNotMatch(smoke, /sk_test_[A-Za-z0-9]/);

const signatureAt = smoke.indexOf("verifyStripeSignature(rawBody, signature, webhookSecret)");
const parseAt = smoke.indexOf("const event = JSON.parse(rawBody)");
const eventModeAt = smoke.indexOf("assertStripePayloadMode(event, stripeMode.livemode");
const objectModeAt = smoke.indexOf("assertStripePayloadMode(object, stripeMode.livemode");
assert.ok(signatureAt >= 0 && parseAt > signatureAt, "signed body must be verified before parsing");
assert.ok(eventModeAt > parseAt && objectModeAt > eventModeAt, "livemode checks must follow signature verification");

console.log("Stripe webhook runtime smoke is signed, sandbox-only and mutation-free.");
