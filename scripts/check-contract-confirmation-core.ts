import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildContractConfirmationText,
  CONTRACT_LEGAL_VERSIONS,
  type ContractConfirmationInput,
} from "../supabase/functions/_shared/contract-confirmation-core.ts";

const coreSource = readFileSync("supabase/functions/_shared/contract-confirmation-core.ts", "utf8");

const base: ContractConfirmationInput = {
  productName: "GameSignal",
  siteUrl: "https://game-signals.vercel.app/",
  seller: {
    profileKey: "lumino_games_20260814",
    legalName: "Lumino Games sp. z o.o.",
    nip: "6762600090",
    registeredAddress: "ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Poland",
    countryCode: "PL",
    supportEmail: "contact.gamesignals@gmail.com",
    supportPhone: "+48 123 456 789",
  },
  buyer: {
    type: "individual",
    email: "buyer@example.test",
    name: "Test Buyer",
    billingCountry: "pl",
  },
  subscription: {
    plan: "indie",
    billingPeriod: "monthly",
    currency: "pln",
    subtotalAmount: 2450,
    discountAmount: 0,
    taxAmount: 458,
    totalAmount: 2450,
    paymentStatus: "paid",
  },
  consent: {
    termsAccepted: true,
    recurringBillingAccepted: true,
    immediateServiceRequested: true,
  },
  stripeCheckoutSessionId: "cs_test_contract_confirmation_123",
  contractConcludedAt: "2026-08-15T10:30:00+02:00",
};

// This builder belongs to the historical direct-Stripe evidence path. Its legal
// versions and old brand/domain snapshot are intentionally immutable and must
// not be silently rewritten when the public product/legal pages are rebranded.
assert.deepEqual(CONTRACT_LEGAL_VERSIONS, {
  terms: "2026-08-15-v3",
  privacy: "2026-08-15-v3",
  withdrawal: "2026-08-15-v1",
  confirmation: "2026-08-15-v1",
});

const first = buildContractConfirmationText(base);
const second = buildContractConfirmationText(structuredClone(base));
assert.equal(first, second, "same contract evidence must produce byte-identical text");
assert.ok(first.length > 1000, "confirmation should contain the complete transactional legal snapshot");

for (const requiredText of [
  "GameSignal — confirmation of concluded subscription contract",
  "Confirmation version: 2026-08-15-v1",
  "Contract concluded at: 2026-08-15T08:30:00.000Z",
  "Stripe Checkout Session: cs_test_contract_confirmation_123",
  "Lumino Games sp. z o.o.",
  "NIP: 6762600090",
  "Seller profile: lumino_games_20260814",
  "Buyer route: Individual / consumer route",
  "Email: buyer@example.test",
  "Billing country: PL",
  "Plan: indie",
  "Billing period: monthly",
  "Checkout subtotal: 24.50 PLN",
  "Discount: 0.00 PLN",
  "Tax included or charged by Checkout: 4.58 PLN",
  "Total for the initial billing period: 24.50 PLN",
  "Checkout payment status at contract confirmation: paid",
  "Recurring billing accepted: YES",
  "Terms accepted: YES",
  "Immediate service requested: YES",
  "Terms version: 2026-08-15-v3",
  "Privacy version: 2026-08-15-v3",
  "Withdrawal information version: 2026-08-15-v1",
  "https://game-signals.vercel.app/terms",
  "https://game-signals.vercel.app/privacy",
  "https://game-signals.vercel.app/withdrawal",
]) {
  assert.ok(first.includes(requiredText), `confirmation is missing: ${requiredText}`);
}

const discountedUnpaid = buildContractConfirmationText({
  ...base,
  subscription: {
    ...base.subscription,
    subtotalAmount: 3000,
    discountAmount: 500,
    taxAmount: 575,
    totalAmount: 3075,
    paymentStatus: "unpaid",
  },
});
assert.match(discountedUnpaid, /Checkout subtotal: 30\.00 PLN/);
assert.match(discountedUnpaid, /Discount: 5\.00 PLN/);
assert.match(discountedUnpaid, /Tax included or charged by Checkout: 5\.75 PLN/);
assert.match(discountedUnpaid, /Total for the initial billing period: 30\.75 PLN/);
assert.match(discountedUnpaid, /Checkout payment status at contract confirmation: unpaid/);
assert.doesNotMatch(discountedUnpaid, /Total charged for the initial billing period/);
assert.doesNotMatch(discountedUnpaid, /Subtotal before discounts and tax/);

const company = buildContractConfirmationText({
  ...base,
  buyer: { ...base.buyer, type: "company", name: "Example Studio sp. z o.o." },
  consent: { ...base.consent, immediateServiceRequested: false },
  subscription: { ...base.subscription, plan: "studio", billingPeriod: "yearly", paymentStatus: "no_payment_required" },
});
assert.match(company, /Buyer route: Company \/ business route/);
assert.match(company, /Immediate service requested: NO/);
assert.match(company, /Billing period: yearly/);
assert.match(company, /Checkout payment status at contract confirmation: no_payment_required/);
assert.match(company, /No additional contractual 14-day consumer withdrawal right/);

assert.throws(
  () => buildContractConfirmationText({
    ...base,
    consent: { ...base.consent, immediateServiceRequested: false },
  }),
  /Individual paid checkout requires an explicit immediate-service request/,
);
assert.throws(
  () => buildContractConfirmationText({ ...base, seller: { ...base.seller, nip: "123" } }),
  /Seller NIP must contain exactly 10 digits/,
);
assert.throws(
  () => buildContractConfirmationText({
    ...base,
    subscription: { ...base.subscription, currency: "PL" },
  }),
  /three-letter currency code/,
);
assert.throws(
  () => buildContractConfirmationText({
    ...base,
    subscription: { ...base.subscription, discountAmount: -1 },
  }),
  /non-negative integer in minor units/,
);
assert.throws(
  () => buildContractConfirmationText({
    ...base,
    consent: { ...base.consent, termsAccepted: false },
  }),
  /required checkout acceptance evidence/,
);
assert.throws(
  () => buildContractConfirmationText({ ...base, contractConcludedAt: "not-a-date" }),
  /valid date-time/,
);

assert.doesNotMatch(coreSource, /Deno\.env|process\.env/);
assert.doesNotMatch(coreSource, /\bfetch\s*\(/);
assert.doesNotMatch(coreSource, /createClient|supabase/i);
assert.doesNotMatch(coreSource, /Date\.now\s*\(/);
assert.doesNotMatch(coreSource, /new Date\(\s*\)/);

console.log("Legacy direct-Stripe contract confirmation builder remains deterministic, amount-complete, version-locked and fail-closed.");
