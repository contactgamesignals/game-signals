import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildContractConfirmationText,
  CONTRACT_LEGAL_VERSIONS,
  type ContractConfirmationInput,
} from "../supabase/functions/_shared/contract-confirmation-core.ts";

const coreSource = readFileSync("supabase/functions/_shared/contract-confirmation-core.ts", "utf8");
const legalSource = readFileSync("lib/legal.ts", "utf8");

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
    subtotalAmount: 1992,
    taxAmount: 458,
    totalAmount: 2450,
  },
  consent: {
    termsAccepted: true,
    recurringBillingAccepted: true,
    immediateServiceRequested: true,
  },
  stripeCheckoutSessionId: "cs_test_contract_confirmation_123",
  contractConcludedAt: "2026-08-15T10:30:00+02:00",
};

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
  "Subtotal: 19.92 PLN",
  "Tax: 4.58 PLN",
  "Total charged for the initial billing period: 24.50 PLN",
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

const company = buildContractConfirmationText({
  ...base,
  buyer: { ...base.buyer, type: "company", name: "Example Studio sp. z o.o." },
  consent: { ...base.consent, immediateServiceRequested: false },
  subscription: { ...base.subscription, plan: "studio", billingPeriod: "yearly" },
});
assert.match(company, /Buyer route: Company \/ business route/);
assert.match(company, /Immediate service requested: NO/);
assert.match(company, /Billing period: yearly/);
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
    subscription: { ...base.subscription, taxAmount: -1 },
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

// The Supabase-side legal version constants and the public Next.js legal pages
// must advance together. The script deliberately compares source-level constants
// so importing the server-only Next.js module is unnecessary.
for (const [key, value] of Object.entries({
  terms: CONTRACT_LEGAL_VERSIONS.terms,
  privacy: CONTRACT_LEGAL_VERSIONS.privacy,
  withdrawal: CONTRACT_LEGAL_VERSIONS.withdrawal,
})) {
  assert.match(legalSource, new RegExp(`${key}: "${value.replaceAll(".", "\\.")}"`));
}

// Determinism: this builder cannot read environment, make network/database calls
// or depend on wall-clock time. All changing inputs must be supplied explicitly.
assert.doesNotMatch(coreSource, /Deno\.env|process\.env/);
assert.doesNotMatch(coreSource, /\bfetch\s*\(/);
assert.doesNotMatch(coreSource, /createClient|supabase/i);
assert.doesNotMatch(coreSource, /Date\.now\s*\(/);
assert.doesNotMatch(coreSource, /new Date\(\s*\)/);

console.log("Contract confirmation builder is deterministic, version-locked and fail-closed.");
