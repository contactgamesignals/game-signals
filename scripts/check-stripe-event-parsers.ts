import assert from "node:assert/strict";

import {
  mapStripeSubscriptionStatus,
  parseAuthoritativeSubscriptionState,
  parseChargeLocationEvidence,
  parseCheckoutSubscriptionLink,
  parseDisputeRecord,
} from "../supabase/functions/_shared/stripe-event-parsers.ts";

assert.equal(mapStripeSubscriptionStatus("active"), "active");
assert.equal(mapStripeSubscriptionStatus("unpaid"), "past_due");
assert.equal(mapStripeSubscriptionStatus("paused"), "past_due");
assert.equal(mapStripeSubscriptionStatus("incomplete_expired"), "canceled");
assert.equal(mapStripeSubscriptionStatus("unexpected"), "incomplete");

const subscription = parseAuthoritativeSubscriptionState({
  id: "sub_test",
  status: "unpaid",
  customer: "cus_test",
  cancel_at_period_end: true,
  current_period_end: 1_800_000_000,
  metadata: { workspace_id: "workspace-test", plan: "studio" },
  items: {
    data: [{ price: { lookup_key: "gamesignal_studio_monthly", metadata: {} } }],
  },
});
assert.equal(subscription.workspaceId, "workspace-test");
assert.equal(subscription.plan, "studio");
assert.equal(subscription.status, "past_due");
assert.equal(subscription.stripeSubscriptionId, "sub_test");
assert.equal(subscription.stripeCustomerId, "cus_test");
assert.equal(subscription.cancelAtPeriodEnd, true);

const checkout = parseCheckoutSubscriptionLink({
  mode: "subscription",
  client_reference_id: "workspace-checkout",
  customer: "cus_checkout",
  subscription: "sub_checkout",
  metadata: { plan: "publisher" },
  payment_status: "paid",
});
assert.deepEqual(checkout, {
  workspaceId: "workspace-checkout",
  stripeCustomerId: "cus_checkout",
  stripeSubscriptionId: "sub_checkout",
  mode: "subscription",
});
assert.equal("plan" in checkout, false, "Checkout parser must not grant a paid plan.");
assert.equal("status" in checkout, false, "Checkout parser must not set paid entitlement status.");

const matchingLocation = parseChargeLocationEvidence({
  id: "ch_match",
  customer: "cus_location",
  payment_intent: "pi_match",
  billing_details: { address: { country: "PL" } },
  payment_method_details: { type: "card", card: { country: "PL" } },
  created: 1_800_000_000,
  livemode: false,
});
assert.equal(matchingLocation.consistency, "match");
assert.equal(matchingLocation.billingCountry, "PL");
assert.equal(matchingLocation.paymentMethodCountry, "PL");

const mismatchingLocation = parseChargeLocationEvidence({
  id: "ch_mismatch",
  billing_details: { address: { country: "PL" } },
  payment_method_details: { type: "card", card: { country: "US" } },
  livemode: false,
});
assert.equal(mismatchingLocation.consistency, "mismatch");

const insufficientLocation = parseChargeLocationEvidence({
  id: "ch_insufficient",
  billing_details: { address: { country: "DE" } },
  payment_method_details: { type: "link" },
  livemode: false,
});
assert.equal(insufficientLocation.consistency, "insufficient");

const openDispute = parseDisputeRecord({
  id: "du_open",
  charge: "ch_disputed",
  payment_intent: "pi_disputed",
  status: "needs_response",
  reason: "fraudulent",
  amount: 6450,
  currency: "pln",
  evidence_details: { due_by: 1_800_100_000, past_due: false, submission_count: 0 },
  is_charge_refundable: true,
  created: 1_800_000_000,
  livemode: false,
}, "charge.dispute.created");
assert.equal(openDispute.status, "needs_response");
assert.equal(openDispute.closedAt, null);
assert.equal(openDispute.amount, 6450);

const closedDispute = parseDisputeRecord({
  id: "du_closed",
  charge: "ch_disputed",
  status: "won",
  reason: "fraudulent",
  amount: 6450,
  currency: "pln",
  evidence_details: { past_due: false, submission_count: 1 },
  created: 1_800_000_000,
  livemode: false,
}, "charge.dispute.closed");
assert.equal(closedDispute.status, "won");
assert.notEqual(closedDispute.closedAt, null);

console.log("Stripe event parser regression checks passed.");
