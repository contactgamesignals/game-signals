import { createClient } from "npm:@supabase/supabase-js@2";

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

function isPaidPlan(value: unknown): value is "indie" | "studio" | "publisher" {
  return value === "indie" || value === "studio" || value === "publisher";
}

function isBuyerType(value: unknown): value is "individual" | "company" {
  return value === "individual" || value === "company";
}

function planFromLookupKey(value: unknown): "indie" | "studio" | "publisher" | null {
  if (typeof value !== "string") return null;
  const match = /^gamesignal_(indie|studio|publisher)_(monthly|yearly)$/.exec(value);
  return match ? match[1] as "indie" | "studio" | "publisher" : null;
}

function planFromPrice(value: unknown) {
  const price = objectValue(value);
  if (!price) return null;
  const fromLookup = planFromLookupKey(price.lookup_key);
  if (fromLookup) return fromLookup;
  const metadata = metadataOf(price);
  return isPaidPlan(metadata.gamesignal_plan) ? metadata.gamesignal_plan : null;
}

function planFromSubscription(object: Record<string, unknown>) {
  const items = objectValue(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = data.length ? objectValue(data[0]) : null;
  const fromItem = planFromPrice(first?.price) ?? planFromPrice(first?.plan);
  if (fromItem) return fromItem;
  return planFromPrice(object.plan);
}

function mapStatus(value: unknown): "trialing" | "active" | "past_due" | "canceled" | "incomplete" {
  if (value === "trialing" || value === "active" || value === "past_due" || value === "canceled" || value === "incomplete") {
    return value;
  }
  if (value === "incomplete_expired") return "canceled";
  if (value === "unpaid" || value === "paused") return "past_due";
  return "incomplete";
}

function currentPeriodEnd(object: Record<string, unknown>) {
  if (typeof object.current_period_end === "number") {
    return new Date(object.current_period_end * 1000).toISOString();
  }
  const items = objectValue(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = data.length ? objectValue(data[0]) : null;
  return typeof first?.current_period_end === "number"
    ? new Date(first.current_period_end * 1000).toISOString()
    : null;
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
    return [{
      type,
      value,
      verification_status: stringValue(verification?.status),
    }];
  });
}

function jurisdictionBucket(country: string | null) {
  if (!country) return "unknown";
  if (country === "PL") return "pl";
  if (EU_COUNTRIES.has(country)) return "eu";
  return "non_eu";
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
  if (!workspaceId && customerId) {
    const { data } = await service
      .from("subscriptions")
      .select("workspace_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    workspaceId = data?.workspace_id ?? null;
  }
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
  for (const [key, value] of optional) {
    if (value !== null && value !== undefined) record[key] = value;
  }

  const { error } = await service
    .from("billing_invoice_records")
    .upsert(record, { onConflict: "stripe_invoice_id" });
  if (error) throw error;
}

function hexToBytes(hex: string) {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
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

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: webhookSecret, error: secretError } = await service.rpc("get_internal_vault_secret", {
      secret_name: "gamesignal_stripe_webhook_secret",
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
      data: { object: Record<string, unknown> };
    };
    const object = event.data.object;

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      if (object.mode === "subscription") {
        const metadata = metadataOf(object);
        const workspaceId = stringValue(metadata.workspace_id) ?? stringValue(object.client_reference_id);
        const plan = isPaidPlan(metadata.plan) ? metadata.plan : null;
        if (workspaceId && plan) {
          const paymentStatus = stringValue(object.payment_status);
          const update: Record<string, unknown> = {
            plan,
            status: paymentStatus === "paid" || paymentStatus === "no_payment_required" ? "active" : "incomplete",
            updated_at: new Date().toISOString(),
          };
          const customerId = idFromExpandable(object.customer);
          const subscriptionId = idFromExpandable(object.subscription);
          if (customerId) update.stripe_customer_id = customerId;
          if (subscriptionId) update.stripe_subscription_id = subscriptionId;
          const { error } = await service.from("subscriptions").update(update).eq("workspace_id", workspaceId);
          if (error) throw error;
        }
      }
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const metadata = metadataOf(object);
      const subscriptionId = stringValue(object.id);
      let workspaceId = stringValue(metadata.workspace_id);

      if (!workspaceId && subscriptionId) {
        const { data } = await service
          .from("subscriptions")
          .select("workspace_id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        workspaceId = data?.workspace_id ?? null;
      }

      if (workspaceId) {
        const update: Record<string, unknown> = {
          status: mapStatus(object.status),
          cancel_at_period_end: Boolean(object.cancel_at_period_end),
          current_period_end: currentPeriodEnd(object),
          updated_at: new Date().toISOString(),
        };
        const customerId = idFromExpandable(object.customer);
        const derivedPlan = planFromSubscription(object);
        if (subscriptionId) update.stripe_subscription_id = subscriptionId;
        if (customerId) update.stripe_customer_id = customerId;
        if (derivedPlan) update.plan = derivedPlan;
        else if (isPaidPlan(metadata.plan)) update.plan = metadata.plan;
        const { error } = await service.from("subscriptions").update(update).eq("workspace_id", workspaceId);
        if (error) throw error;
      }
    }

    if (
      event.type === "invoice.created" ||
      event.type === "invoice.updated" ||
      event.type === "invoice.finalized" ||
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed" ||
      event.type === "invoice.voided" ||
      event.type === "invoice.marked_uncollectible"
    ) {
      await syncInvoiceRecord(service, event.id, object);
    }

    return json({ received: true });
  } catch (error) {
    console.error(error);
    return json({ error: "Webhook processing failed." }, 500);
  }
});
