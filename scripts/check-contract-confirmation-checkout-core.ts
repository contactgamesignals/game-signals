import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  prepareCheckoutContractConfirmation,
  type CheckoutConsentSnapshot,
  type ContractSellerSnapshot,
} from "../supabase/functions/_shared/contract-confirmation-checkout-core.ts";

const source = readFileSync("supabase/functions/_shared/contract-confirmation-checkout-core.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260815144500_add_withdrawal_version_to_checkout_consent.sql", "utf8");

const consent: CheckoutConsentSnapshot = {
  id: "00000000-0000-4000-8000-000000000201",
  billingAccountId: "00000000-0000-4000-8000-000000000101",
  buyerType: "individual",
  plan: "indie",
  billingPeriod: "monthly",
  termsVersion: "2026-08-15-v3",
  privacyVersion: "2026-08-15-v3",
  withdrawalVersion: "2026-08-15-v1",
  termsAccepted: true,
  recurringBillingAccepted: true,
  immediateServiceRequested: true,
  stripeCheckoutSessionId: "cs_test_confirmation_checkout",
};

const seller: ContractSellerSnapshot = {
  profileKey: "lumino_games_20260814",
  legalName: "Lumino Games sp. z o.o.",
  nip: "6762600090",
  registeredAddress: "ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Poland",
  countryCode: "PL",
};

const session: Record<string, unknown> = {
  id: "cs_test_confirmation_checkout",
  mode: "subscription",
  status: "complete",
  livemode: false,
  payment_status: "paid",
  currency: "pln",
  amount_subtotal: 2450,
  amount_total: 2450,
  total_details: {
    amount_discount: 0,
    amount_tax: 458,
  },
  metadata: {
    consent_id: consent.id,
    buyer_type: "individual",
    plan: "indie",
    billing_period: "monthly",
  },
  customer_details: {
    email: "buyer@example.test",
    name: "Fallback Name",
    individual_name: "Individual Buyer",
    business_name: null,
    address: { country: "PL" },
  },
};

const prepared = prepareCheckoutContractConfirmation({
  eventId: "evt_checkout_completed_contract",
  eventType: "checkout.session.completed",
  eventCreated: 1786782600,
  expectedLivemode: false,
  session,
  consent,
  seller,
  siteUrl: "https://game-signals.vercel.app",
  supportEmail: "contact.gamesignals@gmail.com",
  supportPhone: "+48 123 456 789",
});

assert.ok("confirmationText" in prepared);
if (!("confirmationText" in prepared)) throw new Error("expected prepared confirmation");
assert.equal(prepared.eventId, "evt_checkout_completed_contract");
assert.equal(prepared.stripeCheckoutSessionId, session.id);
assert.equal(prepared.recipientEmail, "buyer@example.test");
assert.equal(prepared.contractConcludedAt, new Date(1786782600 * 1000).toISOString());
assert.equal(prepared.confirmationInput.buyer.name, "Individual Buyer");
assert.equal(prepared.confirmationInput.subscription.paymentStatus, "paid");
assert.equal(prepared.confirmationInput.subscription.subtotalAmount, 2450);
assert.equal(prepared.confirmationInput.subscription.taxAmount, 458);
assert.match(prepared.confirmationText, /Checkout subtotal: 24\.50 PLN/);
assert.match(prepared.confirmationText, /Tax included or charged by Checkout: 4\.58 PLN/);

const unpaid = prepareCheckoutContractConfirmation({
  eventId: "evt_checkout_completed_unpaid",
  eventType: "checkout.session.completed",
  eventCreated: 1786782601,
  expectedLivemode: false,
  session: { ...session, payment_status: "unpaid" },
  consent,
  seller,
  siteUrl: "https://game-signals.vercel.app",
  supportEmail: "contact.gamesignals@gmail.com",
  supportPhone: "+48 123 456 789",
});
assert.ok("confirmationText" in unpaid);
if ("confirmationText" in unpaid) {
  assert.match(unpaid.confirmationText, /Checkout payment status at contract confirmation: unpaid/);
  assert.doesNotMatch(unpaid.confirmationText, /Total charged for the initial billing period/);
}

const companyConsent: CheckoutConsentSnapshot = {
  ...consent,
  buyerType: "company",
  plan: "studio",
  billingPeriod: "yearly",
  immediateServiceRequested: false,
};
const companySession: Record<string, unknown> = {
  ...session,
  metadata: {
    consent_id: companyConsent.id,
    buyer_type: "company",
    plan: "studio",
    billing_period: "yearly",
  },
  customer_details: {
    email: "finance@example.test",
    name: "Fallback Company Name",
    individual_name: null,
    business_name: "Example Studio sp. z o.o.",
    address: { country: "PL" },
  },
};
const companyPrepared = prepareCheckoutContractConfirmation({
  eventId: "evt_company_completed",
  eventType: "checkout.session.completed",
  eventCreated: 1786782602,
  expectedLivemode: false,
  session: companySession,
  consent: companyConsent,
  seller,
  siteUrl: "https://game-signals.vercel.app",
  supportEmail: "contact.gamesignals@gmail.com",
  supportPhone: "+48 123 456 789",
});
assert.ok("confirmationText" in companyPrepared);
if ("confirmationText" in companyPrepared) {
  assert.equal(companyPrepared.confirmationInput.buyer.name, "Example Studio sp. z o.o.");
  assert.match(companyPrepared.confirmationText, /Buyer route: Company \/ business route/);
}

assert.deepEqual(
  prepareCheckoutContractConfirmation({
    eventId: "evt_other",
    eventType: "checkout.session.async_payment_succeeded",
    eventCreated: 1786782600,
    expectedLivemode: false,
    session,
    consent,
    seller,
    siteUrl: "https://game-signals.vercel.app",
    supportEmail: "contact.gamesignals@gmail.com",
    supportPhone: "+48 123 456 789",
  }),
  { kind: "ignored", reason: "event_type" },
);
assert.deepEqual(
  prepareCheckoutContractConfirmation({
    eventId: "evt_external",
    eventType: "checkout.session.completed",
    eventCreated: 1786782600,
    expectedLivemode: false,
    session: { ...session, metadata: {} },
    consent,
    seller,
    siteUrl: "https://game-signals.vercel.app",
    supportEmail: "contact.gamesignals@gmail.com",
    supportPhone: "+48 123 456 789",
  }),
  { kind: "ignored", reason: "not_gamesignal_checkout" },
);

assert.throws(
  () => prepareCheckoutContractConfirmation({
    eventId: "evt_wrong_runtime",
    eventType: "checkout.session.completed",
    eventCreated: 1786782600,
    expectedLivemode: false,
    session: { ...session, livemode: true },
    consent,
    seller,
    siteUrl: "https://game-signals.vercel.app",
    supportEmail: "contact.gamesignals@gmail.com",
    supportPhone: "+48 123 456 789",
  }),
  /livemode does not match/,
);
assert.throws(
  () => prepareCheckoutContractConfirmation({
    eventId: "evt_wrong_metadata",
    eventType: "checkout.session.completed",
    eventCreated: 1786782600,
    expectedLivemode: false,
    session: { ...session, metadata: { ...(session.metadata as Record<string, unknown>), plan: "publisher" } },
    consent,
    seller,
    siteUrl: "https://game-signals.vercel.app",
    supportEmail: "contact.gamesignals@gmail.com",
    supportPhone: "+48 123 456 789",
  }),
  /metadata plan does not match/,
);
assert.throws(
  () => prepareCheckoutContractConfirmation({
    eventId: "evt_old_withdrawal",
    eventType: "checkout.session.completed",
    eventCreated: 1786782600,
    expectedLivemode: false,
    session,
    consent: { ...consent, withdrawalVersion: null },
    seller,
    siteUrl: "https://game-signals.vercel.app",
    supportEmail: "contact.gamesignals@gmail.com",
    supportPhone: "+48 123 456 789",
  }),
  /Withdrawal version is missing or not the current/,
);
assert.throws(
  () => prepareCheckoutContractConfirmation({
    eventId: "evt_foreign_country",
    eventType: "checkout.session.completed",
    eventCreated: 1786782600,
    expectedLivemode: false,
    session: {
      ...session,
      customer_details: { ...(session.customer_details as Record<string, unknown>), address: { country: "DE" } },
    },
    consent,
    seller,
    siteUrl: "https://game-signals.vercel.app",
    supportEmail: "contact.gamesignals@gmail.com",
    supportPhone: "+48 123 456 789",
  }),
  /requires Polish billing country evidence/,
);
assert.throws(
  () => prepareCheckoutContractConfirmation({
    eventId: "evt_bad_payment",
    eventType: "checkout.session.completed",
    eventCreated: 1786782600,
    expectedLivemode: false,
    session: { ...session, payment_status: "processing" },
    consent,
    seller,
    siteUrl: "https://game-signals.vercel.app",
    supportEmail: "contact.gamesignals@gmail.com",
    supportPhone: "+48 123 456 789",
  }),
  /payment_status is missing or unsupported/,
);

assert.match(migration, /add column if not exists withdrawal_version text/);
assert.match(migration, /withdrawal_version is null/);
assert.match(migration, /legacy consent evidence created before version capture/);
assert.doesNotMatch(migration, /default\s+'2026-08-15-v1'/i);
assert.doesNotMatch(migration, /\bupdate\s+public\.billing_checkout_consents\b/i);

assert.doesNotMatch(source, /Deno\.env|process\.env/);
assert.doesNotMatch(source, /\bfetch\s*\(/);
assert.doesNotMatch(source, /createClient|supabase/i);
assert.doesNotMatch(source, /Date\.now\s*\(/);

console.log("Checkout contract confirmation parser is event-timestamped, version-locked and fail-closed.");
