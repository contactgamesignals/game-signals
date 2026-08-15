import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const smoke = readFileSync("supabase/functions/stripe-runtime-smoke/index.ts", "utf8");

assert.match(smoke, /requireStripeRuntimeMode/);
assert.match(smoke, /STRIPE_RUNTIME_API_VERSION/);
assert.match(smoke, /x-cron-secret/);
assert.match(smoke, /cron_secret_sha256/);
assert.match(smoke, /stripeMode\.livemode/);
assert.match(smoke, /Runtime smoke test is intentionally sandbox-only/);
assert.match(smoke, /https:\/\/api\.stripe\.com\/v1\/account/);
assert.match(smoke, /method:\s*"GET"/);
assert.match(smoke, /mode:\s*"read_only_account_check"/);
assert.match(smoke, /account_loaded:\s*true/);

// The smoke test must never create or mutate Stripe billing objects or local
// accounting/billing records. It exists only to verify the real runtime mode
// and authenticated GET /v1/account connectivity.
assert.doesNotMatch(smoke, /checkout\/sessions/);
assert.doesNotMatch(smoke, /billing_portal/);
assert.doesNotMatch(smoke, /subscriptions\//);
assert.doesNotMatch(smoke, /payment_intents/);
assert.doesNotMatch(smoke, /credit_notes/);
assert.doesNotMatch(smoke, /refunds/);
assert.doesNotMatch(smoke, /\.insert\(/);
assert.doesNotMatch(smoke, /\.update\(/);
assert.doesNotMatch(smoke, /\.upsert\(/);
assert.doesNotMatch(smoke, /Deno\.env\.set\(/);
assert.doesNotMatch(smoke, /sk_live_[A-Za-z0-9]/);
assert.doesNotMatch(smoke, /sk_test_[A-Za-z0-9]/);

console.log("Stripe runtime smoke function is authenticated, sandbox-only and read-only.");
