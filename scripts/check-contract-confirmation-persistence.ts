import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adapter = readFileSync("supabase/functions/_shared/contract-confirmation-checkout.ts", "utf8");
const parser = readFileSync("supabase/functions/_shared/contract-confirmation-checkout-core.ts", "utf8");
const withdrawalMigration = readFileSync("supabase/migrations/20260815144500_add_withdrawal_version_to_checkout_consent.sql", "utf8");

assert.match(adapter, /recordCheckoutContractConfirmation/);
assert.match(adapter, /billing_checkout_consents/);
assert.match(adapter, /billing_account_id/);
assert.match(adapter, /withdrawal_version/);
assert.match(adapter, /billing_seller_profiles/);
assert.match(adapter, /\.eq\("active", true\)/);
assert.match(adapter, /prepareCheckoutContractConfirmation/);
assert.match(adapter, /crypto\.subtle\.digest\("SHA-256"/);
assert.match(adapter, /billing_contract_confirmations/);
assert.match(adapter, /\.insert\(row\)/);
assert.match(adapter, /confirmation_text:\s*prepared\.confirmationText/);
assert.match(adapter, /inserted\.error\?\.code !== "23505"/);
assert.match(adapter, /existing\.data\.confirmation_sha256 !== digest/);
assert.match(adapter, /existing\.data\.stripe_checkout_session_id !== prepared\.stripeCheckoutSessionId/);
assert.match(adapter, /existing\.data\.billing_account_id !== consent\.billingAccountId/);
assert.match(adapter, /manual review is required/);

// Immutable evidence is insert-once. A Stripe retry can only reconcile the
// already-identical row; it may never upsert/patch the frozen contract payload.
assert.doesNotMatch(adapter, /\.upsert\(/);
assert.doesNotMatch(adapter, /\.update\(/);
assert.doesNotMatch(adapter, /RESEND_API_KEY|api\.resend\.com/);
assert.doesNotMatch(adapter, /claim_billing_contract_confirmations_for_delivery/);
assert.doesNotMatch(adapter, /transition_billing_contract_confirmation_delivery/);

// Signed-event timestamp and session data are parsed in the pure core. The DB
// adapter may not replace those values with wall-clock/database defaults.
assert.match(parser, /eventIso\(input\.eventCreated\)/);
assert.match(adapter, /contract_concluded_at:\s*prepared\.contractConcludedAt/);
assert.doesNotMatch(adapter, /Date\.now\s*\(/);
assert.doesNotMatch(adapter, /new Date\(\s*\)/);

// The consent schema extension deliberately leaves legacy sandbox consents
// NULL instead of backfilling a legal version they never actually recorded.
assert.match(withdrawalMigration, /add column if not exists withdrawal_version text/);
assert.match(withdrawalMigration, /withdrawal_version is null/);
assert.doesNotMatch(withdrawalMigration, /default\s+'2026-08-15-v1'/i);
assert.doesNotMatch(withdrawalMigration, /\bupdate\s+public\.billing_checkout_consents\b/i);
assert.doesNotMatch(withdrawalMigration, /\bdrop\s+table\b|\btruncate\s+table\b|\bdelete\s+from\b/i);

console.log("Checkout contract confirmation persistence is insert-once, seller-snapshotted and retry-safe.");
