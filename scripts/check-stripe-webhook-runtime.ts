import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const webhook = readFileSync("supabase/functions/stripe-webhook-v8-draft/index.ts", "utf8");
const runtime = readFileSync("supabase/functions/_shared/stripe-runtime-mode.ts", "utf8");

assert.match(webhook, /requireStripeRuntimeMode/);
assert.match(webhook, /assertStripePayloadMode/);
assert.match(webhook, /STRIPE_RUNTIME_API_VERSION/);
assert.doesNotMatch(webhook, /STRIPE_TEST_KEY_PATTERN/);
assert.doesNotMatch(webhook, /sandbox-only and requires a test secret key/);
assert.match(webhook, /secret_name:\s*stripeMode\.webhookVaultSecretName/);
assert.match(runtime, /gamesignal_stripe_webhook_secret/);
assert.match(runtime, /gamesignal_stripe_live_webhook_secret/);

assert.match(webhook, /typeof event\.livemode !== "boolean"/);
assert.match(webhook, /typeof object\.livemode !== "boolean"/);
assert.match(webhook, /assertStripePayloadMode\(event, stripeMode\.livemode, "Stripe event"\)/);
assert.match(webhook, /assertStripePayloadMode\(object, stripeMode\.livemode, "Stripe event object"\)/);
assert.match(webhook, /assertStripePayloadMode\(payload, stripeMode\.livemode, `Stripe API GET \$\{path\}`\)/);
assert.match(webhook, /Authorization:\s*`Bearer \$\{stripeMode\.secretKey\}`/);

const handlerStart = webhook.indexOf("Deno.serve(async (request) => {");
assert.ok(handlerStart >= 0, "webhook handler missing");
const handler = webhook.slice(handlerStart);

const verifySignatureAt = handler.indexOf("verifyStripeSignature(rawBody, signature, webhookSecret)");
const parseEventAt = handler.indexOf("const event = JSON.parse(rawBody)");
const assertEventAt = handler.indexOf('assertStripePayloadMode(event, stripeMode.livemode, "Stripe event")');
const assertObjectAt = handler.indexOf('assertStripePayloadMode(object, stripeMode.livemode, "Stripe event object")');
const firstMutationAt = Math.min(
  ...[
    handler.indexOf("await linkCheckoutObjects(service, object)"),
    handler.indexOf("await syncAuthoritativeSubscription(service"),
    handler.indexOf("await syncInvoiceRecord(service"),
    handler.indexOf("await syncCreditNote(service"),
    handler.indexOf("await syncChargeLocationEvidence(service"),
    handler.indexOf("await syncChargeRefundTotal(service"),
    handler.indexOf("await syncDisputeRecord(service"),
  ].filter((value) => value >= 0),
);

assert.ok(verifySignatureAt >= 0, "webhook signature verification missing");
assert.ok(parseEventAt > verifySignatureAt, "event must be parsed only after signature verification");
assert.ok(assertEventAt > parseEventAt, "event livemode must be checked after verified parsing");
assert.ok(assertObjectAt > assertEventAt, "object livemode must be checked after event livemode");
assert.ok(Number.isFinite(firstMutationAt) && firstMutationAt > assertObjectAt, "no billing/accounting mutation may run before livemode checks");

assert.match(webhook, /stripeGet\(`\/subscriptions\/\$\{encodeURIComponent\(subscriptionId\)\}`\)/);
assert.match(webhook, /stripeGet\(`\/charges\/\$\{encodeURIComponent\(chargeId\)\}`\)/);
assert.match(webhook, /return json\(\{ received: true, handler: "stripe-webhook-v8-draft", livemode: stripeMode\.livemode \}\)/);
assert.match(webhook, /Stripe LIVE billing is locked\|Stripe secret/);

// This file remains a draft: testing it must not imply deployment or change
// the production function slug.
assert.match(webhook, /handler: "stripe-webhook-v8-draft"/);
assert.doesNotMatch(webhook, /Deno\.env\.set\(/);

console.log("Stripe webhook v8 draft uses the shared fail-closed runtime before accounting mutations.");
