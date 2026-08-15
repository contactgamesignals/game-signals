import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260815164500_add_stripe_managed_payments_mor.sql", "utf8");

assert.match(migration, /billing_checkout_consents[\s\S]*merchant_of_record/);
assert.match(migration, /billing_invoice_records[\s\S]*merchant_of_record/);
assert.match(migration, /stripe_managed_payments/);
assert.match(migration, /propagate_invoice_merchant_of_record/);
assert.match(migration, /stripe_managed_payments_mor/);
assert.match(migration, /new\.merchant_of_record is distinct from 'lumino_games'/, "Lumino seller-document queue must reject non-direct MoR rows.");
assert.match(migration, /merchant_of_record_unverified/, "Unknown MoR rows must fail closed for entitlement review.");
assert.match(migration, /update public\.billing_invoice_records[\s\S]*merchant_of_record = 'lumino_games'/, "Historical direct Stripe rows must be explicitly preserved.");
assert.doesNotMatch(migration, /drop table/i);
assert.doesNotMatch(migration, /delete from/i);
assert.doesNotMatch(migration, /truncate/i);

console.log("Stripe Merchant-of-Record database routing safeguards passed.");
