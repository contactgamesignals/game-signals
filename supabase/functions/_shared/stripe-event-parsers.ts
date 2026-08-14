export type StripeObject = Record<string, unknown>;

export type PaidPlan = "indie" | "studio" | "publisher";
export type LocalSubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";
export type LocationConsistency = "match" | "mismatch" | "insufficient";

function objectValue(value: unknown): StripeObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as StripeObject : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function idFromExpandable(value: unknown) {
  return typeof value === "string" ? value : stringValue(objectValue(value)?.id);
}

function metadataOf(value: StripeObject) {
  return objectValue(value.metadata) ?? {};
}

function upperCountry(value: unknown) {
  const normalized = stringValue(value)?.toUpperCase() ?? null;
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

function timestamp(value: unknown) {
  const seconds = numberValue(value);
  return seconds === null ? null : new Date(seconds * 1000).toISOString();
}

export function mapStripeSubscriptionStatus(value: unknown): LocalSubscriptionStatus {
  if (value === "trialing" || value === "active" || value === "past_due" || value === "canceled" || value === "incomplete") {
    return value;
  }
  if (value === "incomplete_expired") return "canceled";
  if (value === "unpaid" || value === "paused") return "past_due";
  return "incomplete";
}

function planFromLookupKey(value: unknown): PaidPlan | null {
  if (typeof value !== "string") return null;
  const match = /^gamesignal_(indie|studio|publisher)_(monthly|yearly)$/.exec(value);
  return match ? match[1] as PaidPlan : null;
}

function planFromPrice(value: unknown): PaidPlan | null {
  const price = objectValue(value);
  if (!price) return null;
  const lookup = planFromLookupKey(price.lookup_key);
  if (lookup) return lookup;
  const metadata = metadataOf(price);
  return metadata.gamesignal_plan === "indie" || metadata.gamesignal_plan === "studio" || metadata.gamesignal_plan === "publisher"
    ? metadata.gamesignal_plan
    : null;
}

function planFromSubscription(object: StripeObject): PaidPlan | null {
  const items = objectValue(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = data.length ? objectValue(data[0]) : null;
  return planFromPrice(first?.price) ?? planFromPrice(first?.plan) ?? planFromPrice(object.plan);
}

function currentPeriodEnd(object: StripeObject) {
  const direct = timestamp(object.current_period_end);
  if (direct) return direct;
  const items = objectValue(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = data.length ? objectValue(data[0]) : null;
  return timestamp(first?.current_period_end);
}

/** customer.subscription.* is the authoritative paid-entitlement source. */
export function parseAuthoritativeSubscriptionState(object: StripeObject) {
  const metadata = metadataOf(object);
  const metadataPlan = metadata.plan;
  const plan = planFromSubscription(object) ?? (
    metadataPlan === "indie" || metadataPlan === "studio" || metadataPlan === "publisher"
      ? metadataPlan
      : null
  );

  return {
    stripeSubscriptionId: stringValue(object.id),
    stripeCustomerId: idFromExpandable(object.customer),
    workspaceId: stringValue(metadata.workspace_id),
    plan,
    status: mapStripeSubscriptionStatus(object.status),
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
    currentPeriodEnd: currentPeriodEnd(object),
  };
}

/** Checkout completion links objects only; it must not be authoritative for plan/status. */
export function parseCheckoutSubscriptionLink(object: StripeObject) {
  const metadata = metadataOf(object);
  return {
    workspaceId: stringValue(metadata.workspace_id) ?? stringValue(object.client_reference_id),
    stripeCustomerId: idFromExpandable(object.customer),
    stripeSubscriptionId: idFromExpandable(object.subscription),
    mode: stringValue(object.mode),
  };
}

export function parseChargeLocationEvidence(object: StripeObject) {
  const billingDetails = objectValue(object.billing_details);
  const billingAddress = objectValue(billingDetails?.address);
  const paymentMethodDetails = objectValue(object.payment_method_details);
  const paymentMethodType = stringValue(paymentMethodDetails?.type);
  const methodDetails = paymentMethodType ? objectValue(paymentMethodDetails?.[paymentMethodType]) : null;

  const billingCountry = upperCountry(billingAddress?.country);
  const paymentMethodCountry = upperCountry(methodDetails?.country);
  const consistency: LocationConsistency = !billingCountry || !paymentMethodCountry
    ? "insufficient"
    : billingCountry === paymentMethodCountry
      ? "match"
      : "mismatch";

  return {
    stripeChargeId: stringValue(object.id),
    stripePaymentIntentId: idFromExpandable(object.payment_intent),
    stripeCustomerId: idFromExpandable(object.customer),
    billingCountry,
    paymentMethodCountry,
    paymentMethodType,
    consistency,
    livemode: object.livemode === true,
    chargeCreatedAt: timestamp(object.created),
  };
}

export function parseDisputeRecord(object: StripeObject, eventType: string) {
  const evidenceDetails = objectValue(object.evidence_details);
  const status = stringValue(object.status);
  const closed = eventType === "charge.dispute.closed" || status === "won" || status === "lost" || status === "warning_closed";

  return {
    stripeDisputeId: stringValue(object.id),
    stripeChargeId: idFromExpandable(object.charge),
    stripePaymentIntentId: idFromExpandable(object.payment_intent),
    status,
    reason: stringValue(object.reason),
    currency: stringValue(object.currency)?.toLowerCase() ?? null,
    amount: numberValue(object.amount),
    evidenceDueAt: timestamp(evidenceDetails?.due_by),
    evidencePastDue: evidenceDetails?.past_due === true,
    evidenceSubmissionCount: numberValue(evidenceDetails?.submission_count),
    isChargeRefundable: object.is_charge_refundable === true,
    livemode: object.livemode === true,
    disputeCreatedAt: timestamp(object.created),
    closedAt: closed ? new Date().toISOString() : null,
  };
}
