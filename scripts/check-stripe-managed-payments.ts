import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("supabase/functions/stripe-managed-checkout/index.ts", "utf8");

assert.match(source, /managed_payments\[enabled\]/, "Managed Payments must be explicitly enabled on Checkout.");
assert.match(source, /2025-03-31\.basil/, "Managed Payments requests need a compatible Stripe API version.");
assert.match(source, /STRIPE_MANAGED_PAYMENTS_ENABLED/, "Managed Payments checkout must have an explicit enable gate.");
assert.match(source, /STRIPE_TEST_KEY_PATTERN/, "Readiness checkout must remain test-key locked.");
assert.match(source, /merchant_of_record/, "Managed Payments metadata must identify the Merchant of Record route.");
assert.match(source, /stripe_managed_payments/, "Managed Payments metadata must use the canonical route marker.");
assert.match(source, /STRIPE_MANAGED_PAYMENTS_TAX_CODE/, "Product tax code must be checked before Checkout creation.");
assert.match(source, /product\.tax_code !== requiredTaxCode/, "Checkout must fail closed on an unexpected product tax code.");
assert.doesNotMatch(source, /params\.set\("automatic_tax/, "Managed Payments owns automatic tax behavior.");
assert.doesNotMatch(source, /params\.set\("tax_id_collection/, "Managed Payments owns tax-ID collection.");
assert.doesNotMatch(source, /params\.set\("customer_update/, "Managed Payments does not accept customer_update name/address overrides.");
assert.doesNotMatch(source, /params\.set\("payment_method_/, "Managed Payments owns payment-method selection.");
assert.doesNotMatch(source, /seller_vat_status/, "Direct-seller VAT metadata must not be attached to Managed Payments Checkout.");

console.log("Stripe Managed Payments checkout safeguards passed.");
