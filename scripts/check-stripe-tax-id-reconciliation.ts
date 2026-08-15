import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const worker = readFileSync("supabase/functions/reconcile-stripe-tax-ids/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260815014500_reconcile_stripe_tax_id_verification.sql", "utf8");

assert.match(worker, /STRIPE_TEST_KEY_PATTERN\s*=\s*\/\^sk_test_/);
assert.match(worker, /\.eq\("buyer_type", "company"\)/);
assert.match(worker, /\.eq\("customer_country", "PL"\)/);
assert.match(worker, /\.eq\("stripe_status", "paid"\)/);
assert.match(worker, /\.eq\("livemode", false\)/);
assert.match(worker, /\/v1\/customers\/\$\{encodeURIComponent\(customerId\)\}\/tax_ids/);
assert.match(worker, /taxIdKey\(item\.type, item\.value\)/);
assert.match(worker, /verificationByExactTaxId\.get\(key\)/);
assert.match(worker, /snapshot\.map/);
assert.match(worker, /customer_tax_ids:\s*result\.enriched/);
assert.doesNotMatch(worker, /customer_tax_ids:\s*current/);
assert.doesNotMatch(worker, /\.insert\([\s\S]*customer_tax_ids/i);
assert.doesNotMatch(worker, /sk_live_[A-Za-z0-9]/);
assert.doesNotMatch(worker, /sk_test_[A-Za-z0-9]{8,}/);

assert.match(migration, /drop trigger if exists queue_paid_polish_company_document_after_write/i);
assert.match(migration, /update of[\s\S]*customer_name[\s\S]*customer_tax_ids/i);
assert.match(migration, /update of[\s\S]*customer_address[\s\S]*currency/i);
assert.match(migration, /update of[\s\S]*period_start[\s\S]*period_end/i);
assert.match(migration, /gamesignal-stripe-tax-id-every-5-minutes/i);
assert.match(migration, /'\*\/5 \* \* \* \*'/);
assert.match(migration, /functions\/v1\/reconcile-stripe-tax-ids/i);
assert.match(migration, /x-cron-secret/i);
assert.match(migration, /vault\.decrypted_secrets/i);
assert.match(migration, /gamesignal_cron_secret/i);
assert.doesNotMatch(migration, /sk_live_|sk_test_/i);
assert.doesNotMatch(migration, /\bdrop\s+table\b|\bdrop\s+column\b|\btruncate\s+table\b|\bdelete\s+from\b/i);

console.log("Stripe Tax ID exact-snapshot enrichment, sandbox lock, trigger and cron safeguards passed.");
