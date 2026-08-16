import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const billing = readFileSync("supabase/functions/paddle-billing/index.ts", "utf8");
assert.match(billing, /custom_data:[\s\S]*workspace_id/);
assert.match(billing, /billing_checkout_consents/);
assert.match(billing, /\/portal-sessions/);
assert.match(billing, /assertPaddleCheckoutEnabled/);
assert.match(billing, /PADDLE_CHECKOUT_URL/);
assert.match(billing, /collection_mode: "automatic"/);
assert.doesNotMatch(billing, /pdl_(?:sdbx|live)_apikey_[A-Za-z0-9_]+/, "Paddle API keys must never be committed.");

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

console.log("Paddle Edge Function and provider-neutral migration safeguards passed.");
