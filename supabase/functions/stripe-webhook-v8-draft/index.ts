import { createClient } from "npm:@supabase/supabase-js@2";
import {
  parseAuthoritativeSubscriptionState,
  parseChargeLocationEvidence,
  parseCheckoutSubscriptionLink,
  parseDisputeRecord,
} from "../_shared/stripe-event-parsers.ts";
import {
  assertStripePayloadMode,
  requireStripeRuntimeMode,
  STRIPE_RUNTIME_API_VERSION,
} from "../_shared/stripe-runtime-mode.ts";

const jsonHeaders = { "Content-Type": "application/json" };

const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timestampValue(value: unknown) {
  const timestamp = numberValue(value);
  return timestamp === null ? null : new Date(timestamp * 1000).toISOString();
}

function idFromExpandable(value: unknown) {
  if (typeof value === "string") return value;
  return stringValue(objectValue(value)?.id);
}

function metadataOf(value: Record<string, unknown>) {
  return objectValue(value.metadata) ?? {};
}

function isBuyerType(value: unknown): value is "individual" | "company" {
  return value === "individual" || value === "company";
}

function firstInvoiceLine(invoice: Record<string, unknown>) {
  const lines = objectValue(invoice.lines);
  const data = Array.isArray(lines?.data) ? lines.data : [];
  return data.length ? objectValue(data[0]) : null;
}

function subscriptionDetails(invoice: Record<string, unknown>) {
  const parent = objectValue(invoice.parent);
  return objectValue(parent?.subscription_details) ?? objectValue(invoice.subscription_details);
}

function subscriptionMetadataFromInvoice(invoice: Record<string, unknown>) {
  const details = subscriptionDetails(invoice);
  if (details) return metadataOf(details);
  const line = firstInvoiceLine(invoice);
  return line ? metadataOf(line) : {};
}

function subscriptionIdFromInvoice(invoice: Record<string, unknown>) {
  const direct = idFromExpandable(invoice.subscription);
  if (direct) return direct;
  const details = subscriptionDetails(invoice);
  const fromParent = idFromExpandable(details?.subscription);
  if (fromParent) return fromParent;
  const line = firstInvoiceLine(invoice);
  const parent = objectValue(line?.parent);
  const subscriptionItemDetails = objectValue(parent?.subscription_item_details);
  return idFromExpandable(subscriptionItemDetails?.subscription);
}

function servicePeriodFromInvoice(invoice: Record<string, unknown>) {
  const line = firstInvoiceLine(invoice);
  const period = objectValue(line?.period);
  return {
    start: timestampValue(period?.start) ?? timestampValue(invoice.period_start),
    end: timestampValue(period?.end) ?? timestampValue(invoice.period_end),
  };
}

function sumAmountList(value: unknown) {
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, entry) => {
    const amount = numberValue(objectValue(entry)?.amount);
    return total + (amount ?? 0);
  }, 0);
}

function customerTaxIds(invoice: Record<string, unknown>) {
  if (!Array.isArray(invoice.customer_tax_ids)) return [];
  return invoice.customer_tax_ids.flatMap((entry) => {
    const taxId = objectValue(entry);
    if (!taxId) return [];
    const type = stringValue(taxId.type);
    const value = stringValue(taxId.value);
    if (!type && !value) return [];
    const verification = objectValue(taxId.verification);
    return [{ type, value, verification_status: stringValue(verification?.status) }];
  });
}

function jurisdictionBucket(country: string | null) {
  if (!country) return "unknown";
  if (country === "PL") return "pl";
  if (EU_COUNTRIES.has(country)) return "eu";
  return "non_eu";
}

async function workspaceFromCustomer(service: ReturnType<typeof createClient>, customerId: string | null) {
  if (!customerId) return null;
  const { data } = await service
    .from("subscriptions")
    .select("workspace_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.workspace_id ?? null;
}

async function workspaceFromInvoiceLedger(service: ReturnType<typeof createClient>, invoiceId: string | null) {
  if (!invoiceId) return { workspaceId: null as string | null, linked: false };
  const { data } = await service
    .from("billing_invoice_records")
    .select("workspace_id")
    .eq("stripe_invoice_id", invoiceId)
    .maybeSingle();
  return { workspaceId: data?.workspace_id ?? null, linked: Boolean(data?.workspace_id) };
}

async function stripeGet(path: string) {
  const stripeMode = requireStripeRuntimeMode();
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${stripeMode.secretKey}`,
      "Stripe-Version": STRIPE_RUNTIME_API_VERSION,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !payload) throw new Error(`Stripe API GET ${path} failed with HTTP ${response.status}.`);
  assertStripePayloadMode(payload, stripeMode.livemode, `Stripe API GET ${path}`);
  return payload;
}

async function syncInvoiceRecord(
  service: ReturnType<typeof createClient>,
  eventId: string,
  invoice: Record<string, unknown>,
) {
  const invoiceId = stringValue(invoice.id);
  if (!invoiceId) return;

  const subscriptionMetadata = subscriptionMetadataFromInvoice(invoice);
  const invoiceMetadata = metadataOf(invoice);
  const subscriptionId = subscriptionIdFromInvoice(invoice);
  const customerId = idFromExpandable(invoice.customer);
  let workspaceId = stringValue(subscriptionMetadata.workspace_id) ?? stringValue(invoiceMetadata.workspace_id);

  if (!workspaceId && subscriptionId) {
    const { data } = await service
      .from("subscriptions")
      .select("workspace_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    workspaceId = data?.workspace_id ?? null;
  }
  if (!workspaceId) workspaceId = await workspaceFromCustomer(service, customerId);
  if (!workspaceId) {
    console.warn("Stripe invoice could not be linked to a GameSignal workspace", invoiceId);
    return;
  }

  const consentCandidate = stringValue(subscriptionMetadata.consent_id) ?? stringValue(invoiceMetadata.consent_id);
  let consentId: string | null = null;
  let buyerType = isBuyerType(subscriptionMetadata.buyer_type)
    ? subscriptionMetadata.buyer_type
    : isBuyerType(invoiceMetadata.buyer_type)
      ? invoiceMetadata.buyer_type
      : null;

  if (consentCandidate) {
    const { data: consent } = await service
      .from("billing_checkout_consents")
      .select("id, buyer_type")
      .eq("id", consentCandidate)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (consent?.id) {
      consentId = consent.id;
      if (!buyerType && isBuyerType(consent.buyer_type)) buyerType = consent.buyer_type;
    }
  }

  const address = objectValue(invoice.customer_address);
  const country = stringValue(address?.country)?.toUpperCase() ?? null;
  const servicePeriod = servicePeriodFromInvoice(invoice);
  const statusTransitions = objectValue(invoice.status_transitions);

  const record: Record<string, unknown> = {
    workspace_id: workspaceId,
    stripe_invoice_id: invoiceId,
    livemode: Boolean(invoice.livemode),
    last_stripe_event_id: eventId,
  };

  const optional: Array<[string, unknown]> = [
    ["checkout_consent_id", consentId],
    ["stripe_customer_id", customerId],
    ["stripe_subscription_id", subscriptionId],
    ["buyer_type", buyerType],
    ["stripe_status", stringValue(invoice.status)],
    ["invoice_number", stringValue(invoice.number)],
    ["billing_reason", stringValue(invoice.billing_reason)],
    ["currency", stringValue(invoice.currency)?.toLowerCase() ?? null],
    ["subtotal_amount", numberValue(invoice.subtotal)],
    ["discount_amount", sumAmountList(invoice.total_discount_amounts)],
    ["tax_amount", sumAmountList(invoice.total_taxes)],
    ["total_amount", numberValue(invoice.total)],
    ["amount_paid", numberValue(invoice.amount_paid)],
    ["amount_remaining", numberValue(invoice.amount_remaining)],
    ["attempt_count", numberValue(invoice.attempt_count)],
    ["next_payment_attempt", timestampValue(invoice.next_payment_attempt)],
    ["collection_method", stringValue(invoice.collection_method)],
    ["customer_email", stringValue(invoice.customer_email)],
    ["customer_name", stringValue(invoice.customer_name)],
    ["customer_country", country],
    ["customer_address", address],
    ["customer_tax_ids", customerTaxIds(invoice)],
    ["jurisdiction_bucket", country ? jurisdictionBucket(country) : null],
    ["invoice_created_at", timestampValue(invoice.created)],
    ["period_start", servicePeriod.start],
    ["period_end", servicePeriod.end],
    ["finalized_at", timestampValue(statusTransitions?.finalized_at)],
    ["paid_at", timestampValue(statusTransitions?.paid_at)],
    ["hosted_invoice_url", stringValue(invoice.hosted_invoice_url)],
    ["invoice_pdf", stringValue(invoice.invoice_pdf)],
  ];
  for (const [key, value] of optional) if (value !== null && value !== undefined) record[key] = value;

  const { error } = await service.from("billing_invoice_records").upsert(record, { onConflict: "stripe_invoice_id" });
  if (error) throw error;
}

async function syncCreditNote(
  service: ReturnType<typeof createClient>,
  eventId: string,
  creditNote: Record<string, unknown>,
) {
  const creditNoteId = stringValue(creditNote.id);
  if (!creditNoteId) return;
  const invoiceId = idFromExpandable(creditNote.invoice);
  const customerId = idFromExpandable(creditNote.customer);
  const invoiceLookup = await workspaceFromInvoiceLedger(service, invoiceId);
  const workspaceId = invoiceLookup.workspaceId ?? await workspaceFromCustomer(service, customerId);
  if (!workspaceId) {
    console.warn("Stripe credit note could not be linked to a GameSignal workspace", creditNoteId);
    return;
  }

  const record: Record<string, unknown> = {
    workspace_id: workspaceId,
    adjustment_type: "credit_note",
    stripe_object_id: creditNoteId,
    livemode: Boolean(creditNote.livemode),
    needs_accounting_review: !invoiceLookup.linked,
    last_stripe_event_id: eventId,
  };
  const optional: Array<[string, unknown]> = [
    ["stripe_invoice_id", invoiceId],
    ["stripe_customer_id", customerId],
    ["document_number", stringValue(creditNote.number)],
    ["status", stringValue(creditNote.status)],
    ["reason", stringValue(creditNote.reason)],
    ["currency", stringValue(creditNote.currency)?.toLowerCase() ?? null],
    ["amount", numberValue(creditNote.amount) ?? numberValue(creditNote.total)],
    ["pre_payment_amount", numberValue(creditNote.pre_payment_amount)],
    ["post_payment_amount", numberValue(creditNote.post_payment_amount)],
    ["effective_at", timestampValue(creditNote.effective_at) ?? timestampValue(creditNote.created)],
    ["voided_at", timestampValue(creditNote.voided_at)],
    ["document_pdf", stringValue(creditNote.pdf)],
  ];
  for (const [key, value] of optional) if (value !== null && value !== undefined) record[key] = value;

  const { error } = await service
    .from("billing_adjustment_records")
    .upsert(record, { onConflict: "adjustment_type,stripe_object_id" });
  if (error) throw error;
}

async function syncChargeRefundTotal(
  service: ReturnType<typeof createClient>,
  eventId: string,
  eventCreated: number | null,
  charge: Record<string, unknown>,
) {
  const chargeId = stringValue(charge.id);
  const amountRefunded = numberValue(charge.amount_refunded);
  if (!chargeId || amountRefunded === null || amountRefunded <= 0) return;
  const customerId = idFromExpandable(charge.customer);
  const workspaceId = await workspaceFromCustomer(service, customerId);
  if (!workspaceId) {
    console.warn("Stripe refunded charge could not be linked to a GameSignal workspace", chargeId);
    return;
  }

  const record: Record<string, unknown> = {
    workspace_id: workspaceId,
    adjustment_type: "refund_total",
    stripe_object_id: chargeId,
    stripe_charge_id: chargeId,
    stripe_customer_id: customerId,
    status: charge.refunded === true ? "fully_refunded" : "partially_refunded",
    currency: stringValue(charge.currency)?.toLowerCase() ?? null,
    amount: amountRefunded,
    effective_at: eventCreated === null ? null : new Date(eventCreated * 1000).toISOString(),
    livemode: Boolean(charge.livemode),
    needs_accounting_review: true,
    last_stripe_event_id: eventId,
  };

  const { error } = await service
    .from("billing_adjustment_records")
    .upsert(record, { onConflict: "adjustment_type,stripe_object_id" });
  if (error) throw error;
}

async function syncChargeLocationEvidence(
  service: ReturnType<typeof createClient>,
  eventId: string,
  charge: Record<string, unknown>,
) {
  const parsed = parseChargeLocationEvidence(charge);
  if (!parsed.stripeChargeId) return null;
  const workspaceId = await workspaceFromCustomer(service, parsed.stripeCustomerId);
  if (!workspaceId) {
    console.warn("Stripe charge could not be linked for location evidence", parsed.stripeChargeId);
    return null;
  }

  const record: Record<string, unknown> = {
    workspace_id: workspaceId,
    stripe_charge_id: parsed.stripeChargeId,
    evidence_consistency: parsed.consistency,
    evidence_source: "stripe_charge",
    livemode: parsed.livemode,
    last_stripe_event_id: eventId,
  };
  const optional: Array<[string, unknown]> = [
    ["stripe_payment_intent_id", parsed.stripePaymentIntentId],
    ["stripe_customer_id", parsed.stripeCustomerId],
    ["billing_country", parsed.billingCountry],
    ["payment_method_country", parsed.paymentMethodCountry],
    ["payment_method_type", parsed.paymentMethodType],
    ["charge_created_at", parsed.chargeCreatedAt],
  ];
  for (const [key, value] of optional) if (value !== null && value !== undefined) record[key] = value;

  const { error } = await service
    .from("billing_location_evidence")
    .upsert(record, { onConflict: "stripe_charge_id" });
  if (error) throw error;
  return workspaceId as string;
}

async function workspaceFromDisputeCharge(
  service: ReturnType<typeof createClient>,
  eventId: string,
  chargeId: string,
) {
  const { data: evidence } = await service
    .from("billing_location_evidence")
    .select("workspace_id")
    .eq("stripe_charge_id", chargeId)
    .maybeSingle();
  if (evidence?.workspace_id) return evidence.workspace_id as string;

  const charge = await stripeGet(`/charges/${encodeURIComponent(chargeId)}`);
  return await syncChargeLocationEvidence(service, eventId, charge);
}

async function syncDisputeRecord(
  service: ReturnType<typeof createClient>,
  eventId: string,
  eventType: string,
  eventCreated: number | null,
  dispute: Record<string, unknown>,
) {
  const parsed = parseDisputeRecord(dispute, eventType);
  if (!parsed.stripeDisputeId || !parsed.stripeChargeId) return;

  const workspaceId = await workspaceFromDisputeCharge(service, eventId, parsed.stripeChargeId);
  if (!workspaceId) {
    console.warn("Stripe dispute could not be linked to a GameSignal workspace", parsed.stripeDisputeId);
    return;
  }

  const eventAt = eventCreated === null ? null : new Date(eventCreated * 1000).toISOString();
  const terminal = parsed.status === "won" || parsed.status === "lost" || parsed.status === "warning_closed";
  const fundsState = eventType === "charge.dispute.funds_withdrawn"
    ? "withdrawn"
    : eventType === "charge.dispute.funds_reinstated"
      ? "reinstated"
      : null;

  const record: Record<string, unknown> = {
    workspace_id: workspaceId,
    stripe_dispute_id: parsed.stripeDisputeId,
    stripe_charge_id: parsed.stripeChargeId,
    livemode: parsed.livemode,
    needs_accounting_review: true,
    needs_access_review: true,
    last_stripe_event_id: eventId,
  };
  const optional: Array<[string, unknown]> = [
    ["stripe_payment_intent_id", parsed.stripePaymentIntentId],
    ["status", parsed.status],
    ["reason", parsed.reason],
    ["currency", parsed.currency],
    ["amount", parsed.amount],
    ["evidence_due_at", parsed.evidenceDueAt],
    ["evidence_past_due", parsed.evidencePastDue],
    ["evidence_submission_count", parsed.evidenceSubmissionCount],
    ["is_charge_refundable", parsed.isChargeRefundable],
    ["dispute_created_at", parsed.disputeCreatedAt],
    ["closed_at", terminal ? eventAt : null],
    ["funds_state", fundsState],
    ["last_funds_event_at", fundsState ? eventAt : null],
  ];
  for (const [key, value] of optional) if (value !== null && value !== undefined) record[key] = value;

  const { error } = await service
    .from("billing_dispute_records")
    .upsert(record, { onConflict: "stripe_dispute_id" });
  if (error) throw error;
}

async function linkCheckoutObjects(
  service: ReturnType<typeof createClient>,
  object: Record<string, unknown>,
) {
  const link = parseCheckoutSubscriptionLink(object);
  if (link.mode !== "subscription" || !link.workspaceId) return;
  const update: Record<string, unknown> = {};
  if (link.stripeCustomerId) update.stripe_customer_id = link.stripeCustomerId;
  if (link.stripeSubscriptionId) update.stripe_subscription_id = link.stripeSubscriptionId;
  if (!Object.keys(update).length) return;
  const { error } = await service.from("subscriptions").update(update).eq("workspace_id", link.workspaceId);
  if (error) throw error;
}

async function syncAuthoritativeSubscription(
  service: ReturnType<typeof createClient>,
  eventId: string,
  eventCreated: number,
  eventObject: Record<string, unknown>,
) {
  const subscriptionId = stringValue(eventObject.id);
  if (!subscriptionId) return;

  // Re-read Stripe at handling time so retries/out-of-order webhook delivery
  // cannot restore stale entitlement state from an older event payload.
  const current = await stripeGet(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const state = parseAuthoritativeSubscriptionState(current);
  let workspaceId = state.workspaceId;

  if (!workspaceId) {
    const { data } = await service
      .from("subscriptions")
      .select("workspace_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    workspaceId = data?.workspace_id ?? null;
  }
  if (!workspaceId) {
    console.warn("Stripe subscription could not be linked to a GameSignal workspace", subscriptionId);
    return;
  }

  const { data, error } = await service.rpc("apply_subscription_stripe_event", {
    p_workspace_id: workspaceId,
    p_event_id: eventId,
    p_event_created_at: new Date(eventCreated * 1000).toISOString(),
    p_plan: state.plan,
    p_status: state.status,
    p_stripe_customer_id: state.stripeCustomerId,
    p_stripe_subscription_id: state.stripeSubscriptionId,
    p_cancel_at_period_end: state.cancelAtPeriodEnd,
    p_current_period_end: state.currentPeriodEnd,
  });
  if (error) throw error;
  if (data !== true) console.info("Ignored strictly older Stripe subscription event", eventId, subscriptionId);
}

function hexToBytes(hex: string) {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`)));
  return signatures.some((signature) => {
    const actual = hexToBytes(signature);
    return actual ? constantTimeEqual(actual, digest) : false;
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server configuration missing." }, 503);

    const stripeMode = requireStripeRuntimeMode();
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: webhookSecret, error: secretError } = await service.rpc("get_internal_vault_secret", {
      secret_name: stripeMode.webhookVaultSecretName,
    });
    if (secretError || typeof webhookSecret !== "string" || !webhookSecret) {
      console.error("Could not load Stripe webhook secret", secretError);
      return json({ error: "Webhook secret unavailable." }, 503);
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) return json({ error: "Missing Stripe signature." }, 400);
    const rawBody = await request.text();
    if (!(await verifyStripeSignature(rawBody, signature, webhookSecret))) {
      return json({ error: "Invalid Stripe signature." }, 400);
    }

    const event = JSON.parse(rawBody) as {
      id: string;
      type: string;
      created?: number;
      api_version?: string | null;
      livemode?: boolean;
      data: { object: Record<string, unknown> };
    };
    const object = event.data.object;
    if (typeof event.livemode !== "boolean") throw new Error("Stripe event is missing livemode evidence.");
    if (typeof object.livemode !== "boolean") throw new Error("Stripe event object is missing livemode evidence.");
    assertStripePayloadMode(event, stripeMode.livemode, "Stripe event");
    assertStripePayloadMode(object, stripeMode.livemode, "Stripe event object");
    const eventCreated = numberValue(event.created);

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await linkCheckoutObjects(service, object);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      if (eventCreated === null) throw new Error("Stripe subscription event is missing event.created.");
      await syncAuthoritativeSubscription(service, event.id, eventCreated, object);
    }

    if (
      event.type === "invoice.created" ||
      event.type === "invoice.updated" ||
      event.type === "invoice.finalized" ||
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.payment_action_required" ||
      event.type === "invoice.payment_attempt_required" ||
      event.type === "invoice.voided" ||
      event.type === "invoice.marked_uncollectible"
    ) {
      await syncInvoiceRecord(service, event.id, object);
    }

    if (
      event.type === "credit_note.created" ||
      event.type === "credit_note.updated" ||
      event.type === "credit_note.voided"
    ) {
      await syncCreditNote(service, event.id, object);
    }

    if (event.type === "charge.succeeded" || event.type === "charge.updated" || event.type === "charge.refunded") {
      await syncChargeLocationEvidence(service, event.id, object);
    }

    if (event.type === "charge.refunded") {
      await syncChargeRefundTotal(service, event.id, eventCreated, object);
    }

    if (
      event.type === "charge.dispute.created" ||
      event.type === "charge.dispute.updated" ||
      event.type === "charge.dispute.closed" ||
      event.type === "charge.dispute.funds_withdrawn" ||
      event.type === "charge.dispute.funds_reinstated"
    ) {
      await syncDisputeRecord(service, event.id, event.type, eventCreated, object);
    }

    return json({ received: true, handler: "stripe-webhook-v8-draft", livemode: stripeMode.livemode });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    const status = /Stripe LIVE billing is locked|Stripe secret/.test(message) ? 503 : 500;
    return json({ error: "Webhook processing failed." }, status);
  }
});