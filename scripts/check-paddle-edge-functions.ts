import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const billing = readFileSync("supabase/functions/paddle-billing/index.ts", "utf8");
assert.match(billing, /custom_data:[\s\S]*workspace_id/);
assert.match(billing, /billing_checkout_consents/);
assert.match(billing, /\/portal-sessions/);
assert.match(billing, /assertPaddleCheckoutEnabled/);
assert.match(billing, /PADDLE_CHECKOUT_URL/);
assert.match(billing, /PADDLE_SANDBOX_CHECKOUT_ENABLED/);
assert.match(billing, /environment === "live" \? liveBillingEnabled : sandboxCheckoutEnabled/);
assert.match(billing, /Paid checkout is not available while Paddle LIVE is being activated\./);
assert.ok(
  billing.indexOf('if (body.action === "portal")') < billing.indexOf('assertPaddleCheckoutEnabled({'),
  "Customer Portal must remain reachable independently from the new-checkout lock.",
);
assert.match(billing, /collection_mode: "automatic"/);
assert.doesNotMatch(billing, /pdl_(?:sdbx|live)_apikey_[A-Za-z0-9_]+/, "Paddle API keys must never be committed.");

const paddlePage = readFileSync("components/PaddleCheckoutPage.tsx", "utf8");
assert.match(paddlePage, /if \(environment === "sandbox"\) paddle\.Environment\.set\("sandbox"\)/);
assert.match(paddlePage, /pwCustomer:\s*\{\s*\}/, "Paddle.js must initialize pwCustomer for LIVE Retain readiness.");
assert.doesNotMatch(paddlePage, /Environment\.set\("production"\)/, "Paddle.js should default to production rather than explicitly setting it.");

const webhook = readFileSync("supabase/functions/paddle-webhook/index.ts", "utf8");
assert.match(webhook, /request\.arrayBuffer\(\)/, "Webhook must verify the untouched raw body bytes.");
assert.match(webhook, /Paddle-Signature/);
assert.match(webhook, /HMAC/);
assert.match(webhook, /SHA-256/);
assert.match(webhook, /MAX_SIGNATURE_AGE_SECONDS = 5/);
assert.match(webhook, /priceMetadata\(catalog, priceId\)/, "Price ID must be authoritative for plan mapping.");
assert.match(webhook, /apply_subscription_paddle_event/);
assert.doesNotMatch(webhook, /transaction\.completed[\s\S]{0,300}apply_subscription_paddle_event/, "One-off completed transactions must not grant subscriptions.");

const migration = readFileSync("supabase/migrations/20260815161000_add_provider_neutral_billing.sql", "utf8");
assert.match(migration, /billing_provider/);
assert.match(migration, /billing_customer_id/);
assert.match(migration, /billing_subscription_id/);
assert.match(migration, /apply_subscription_paddle_event/);
assert.match(migration, /paddle_merchant_of_record/);
assert.doesNotMatch(migration, /drop table/i);
assert.doesNotMatch(migration, /delete from/i);

const readiness = readFileSync("lib/launch-readiness.ts", "utf8");
for (const flag of [
  "GAMESIGNAL_PADDLE_ACCOUNT_READY",
  "GAMESIGNAL_PADDLE_DOMAIN_READY",
  "GAMESIGNAL_PADDLE_CATALOG_READY",
  "GAMESIGNAL_PADDLE_WEBHOOK_READY",
  "GAMESIGNAL_PADDLE_PORTAL_READY",
  "GAMESIGNAL_PADDLE_ACCOUNTING_READY",
  "GAMESIGNAL_PADDLE_LIVE_APPROVED",
]) {
  assert.ok(readiness.includes(flag), `Paddle launch readiness is missing ${flag}`);
}
assert.match(readiness, /configuredBillingProvider\(\)/);
assert.match(readiness, /ready_for_explicit_paddle_live_cutover/);
assert.match(readiness, /legacyDirectBilling/);
assert.match(readiness, /rollback_only/);
assert.doesNotMatch(
  readiness.split("const legacyDirectBillingChecks")[0],
  /GAMESIGNAL_STRIPE_(?:ACCOUNT|RECOVERY|DISPUTES|LIVE)_READY|GAMESIGNAL_KSEF_FLOW_READY/,
  "Legacy Stripe/KSeF readiness must not block the current Paddle launch gate.",
);

console.log("Paddle Edge Function, Paddle.js, provider-neutral migration and Paddle launch-gate safeguards passed.");
