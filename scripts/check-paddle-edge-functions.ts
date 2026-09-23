import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const billing = readFileSync("supabase/functions/paddle-billing/index.ts", "utf8");
const legalVersions = readFileSync("lib/legal-versions.ts", "utf8");
const currentTermsVersion = legalVersions.match(/terms: "([^"]+)"/)?.[1];
const currentPrivacyVersion = legalVersions.match(/privacy: "([^"]+)"/)?.[1];
assert.ok(currentTermsVersion, "Current Terms version must be declared.");
assert.ok(currentPrivacyVersion, "Current Privacy version must be declared.");
assert.ok(
  billing.includes(`const TERMS_VERSION = "${currentTermsVersion}";`),
  "Paddle checkout consent must record the current Terms version.",
);
assert.ok(
  billing.includes(`const PRIVACY_VERSION = "${currentPrivacyVersion}";`),
  "Paddle checkout consent must record the current Privacy version.",
);
assert.match(billing, /custom_data:[\s\S]*workspace_id/);
assert.match(billing, /billing_checkout_consents/);
assert.match(billing, /\/portal-sessions/);
assert.match(billing, /portal_target/, "Paddle portal actions must support explicit workflow targets.");
assert.match(billing, /cancel_subscription/, "Paddle billing must expose the authenticated cancellation deep link.");
assert.match(billing, /update_subscription_payment_method/, "Paddle billing must expose the authenticated payment-method deep link.");
assert.match(billing, /subscription\.status === "past_due"/, "Cancellation must explain Paddle's past-due restriction instead of silently failing.");
assert.match(billing, /cancel_at_period_end: Boolean\(subscription\.cancel_at_period_end\)/, "Paddle billing status must expose scheduled cancellation state.");
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
assert.match(billing, /paddlePlanChangeBillingMode\(body\.change_timing\)/, "Plan changes must use the shared Paddle billing-mode guard.");
assert.doesNotMatch(billing, /full_next_billing_period/, "Deferred plan changes must not create a second full charge at renewal.");
assert.doesNotMatch(billing, /pdl_(?:sdbx|live)_apikey_[A-Za-z0-9_]+/, "Paddle API keys must never be committed.");

const paidPlanPanel = readFileSync("components/PaidPlanChangePanel.tsx", "utf8");
assert.match(paidPlanPanel, /Cancel subscription/, "Active Paddle subscriptions need a direct cancellation action.");
assert.match(paidPlanPanel, /Cancellation scheduled/, "Scheduled Paddle cancellations must be visible in settings.");
assert.match(paidPlanPanel, /!pendingPlan && !cancellationScheduled/, "Plan changes must be hidden while cancellation is already scheduled.");
assert.match(paidPlanPanel, /portal_target: target/, "Cancellation must request a Paddle deep link rather than the generic portal.");

const settingsClient = readFileSync("components/SettingsClient.tsx", "utf8");
assert.match(settingsClient, /Payment failed · monitoring paused/, "Past-due Paddle subscriptions must clearly say that monitoring is paused.");
assert.match(settingsClient, /Update payment method/, "Past-due Paddle subscriptions need a direct payment recovery action.");
assert.match(settingsClient, /Monitoring and paid features are paused/, "Past-due UI must match product-access enforcement.");

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

console.log("Paddle Edge Function, consent-version evidence, Paddle.js, provider-neutral migration and Paddle launch-gate safeguards passed.");
