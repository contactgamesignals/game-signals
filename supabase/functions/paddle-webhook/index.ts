import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildPaddlePriceCatalog,
  isPaddleBillingPeriod,
  isPaddlePaidPlan,
  mapPaddleSubscriptionStatus,
  paddleCancelAtPeriodEnd,
  priceMetadata,
} from "../_shared/paddle-billing-core.ts";

const headers = { "Content-Type": "application/json" };
const MAX_SIGNATURE_AGE_SECONDS = 5;
type PaddleObject = Record<string, unknown>;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function objectValue(value: unknown): PaddleObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PaddleObject : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function firstPriceId(subscription: PaddleObject) {
  const items = Array.isArray(subscription.items) ? subscription.items : [];
  const first = items.length ? objectValue(items[0]) : null;
  return stringValue(objectValue(first?.price)?.id);
}

function currentPeriodEnd(subscription: PaddleObject) {
  return stringValue(objectValue(subscription.current_billing_period)?.ends_at);
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function verifyPaddleSignature(rawBody: Uint8Array, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false;
  const values = signatureHeader.split(";").reduce<Record<string, string[]>>((result, part) => {
    const separator = part.indexOf("=");
    if (separator <= 0) return result;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    result[key] = [...(result[key] ?? []), value];
    return result;
  }, {});
  const timestampText = values.ts?.[0];
  const signatures = values.h1 ?? [];
  if (!timestampText || !signatures.length) return false;
  const timestamp = Number(timestampText);
  if (!Number.isFinite(timestamp)) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > MAX_SIGNATURE_AGE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const prefix = new TextEncoder().encode(`${timestampText}:`);
  const signedPayload = new Uint8Array(prefix.length + rawBody.length);
  signedPayload.set(prefix, 0);
  signedPayload.set(rawBody, prefix.length);
  const digest = await crypto.subtle.sign("HMAC", key, signedPayload);
  const expected = hex(digest);
  return signatures.some((signature) => constantTimeEqual(expected, signature));
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service environment is missing.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function findWorkspace(service: ReturnType<typeof createClient>, subscription: PaddleObject) {
  const customData = objectValue(subscription.custom_data);
  const fromCustomData = stringValue(customData?.workspace_id);
  if (fromCustomData) return fromCustomData;

  const subscriptionId = stringValue(subscription.id);
  if (subscriptionId) {
    const { data } = await service
      .from("subscriptions")
      .select("workspace_id")
      .eq("billing_provider", "paddle")
      .eq("billing_subscription_id", subscriptionId)
      .maybeSingle();
    if (data?.workspace_id) return String(data.workspace_id);
  }

  const customerId = stringValue(subscription.customer_id);
  if (customerId) {
    const { data } = await service
      .from("subscriptions")
      .select("workspace_id")
      .eq("billing_provider", "paddle")
      .eq("billing_customer_id", customerId)
      .maybeSingle();
    if (data?.workspace_id) return String(data.workspace_id);
  }
  return null;
}

async function syncSubscription(
  service: ReturnType<typeof createClient>,
  eventId: string,
  occurredAt: string,
  subscription: PaddleObject,
) {
  const workspaceId = await findWorkspace(service, subscription);
  if (!workspaceId) throw new Error("Paddle subscription could not be linked to a GameSignal workspace.");

  const customData = objectValue(subscription.custom_data) ?? {};
  const priceId = firstPriceId(subscription);
  const catalog = buildPaddlePriceCatalog((key) => Deno.env.get(key) ?? undefined);
  const fromPrice = priceMetadata(catalog, priceId);
  if (!fromPrice) throw new Error(`Paddle subscription price ${priceId ?? "unknown"} is not mapped to a GameSignal plan.`);

  const customPlan = customData.plan;
  if (isPaddlePaidPlan(customPlan) && customPlan !== fromPrice.plan) {
    throw new Error("Paddle subscription custom_data plan does not match its authoritative price ID.");
  }
  const customPeriod = customData.billing_period;
  if (isPaddleBillingPeriod(customPeriod) && customPeriod !== fromPrice.period) {
    throw new Error("Paddle subscription custom_data billing period does not match its authoritative price ID.");
  }

  const { data, error } = await service.rpc("apply_subscription_paddle_event", {
    p_workspace_id: workspaceId,
    p_event_id: eventId,
    p_event_occurred_at: occurredAt,
    p_plan: fromPrice.plan,
    p_status: mapPaddleSubscriptionStatus(subscription.status),
    p_paddle_customer_id: stringValue(subscription.customer_id),
    p_paddle_subscription_id: stringValue(subscription.id),
    p_paddle_price_id: fromPrice.priceId,
    p_billing_period: fromPrice.period,
    p_cancel_at_period_end: paddleCancelAtPeriodEnd(subscription.scheduled_change),
    p_current_period_end: currentPeriodEnd(subscription),
  });
  if (error) throw error;
  return Boolean(data);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const rawBodyBytes = new Uint8Array(await request.arrayBuffer());
  const secret = Deno.env.get("PADDLE_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Paddle webhook secret is not configured." }, 503);
  if (!(await verifyPaddleSignature(rawBodyBytes, request.headers.get("Paddle-Signature"), secret))) {
    return json({ error: "Invalid Paddle signature." }, 400);
  }

  try {
    const event = JSON.parse(new TextDecoder().decode(rawBodyBytes)) as PaddleObject;
    const eventId = stringValue(event.event_id);
    const eventType = stringValue(event.event_type);
    const occurredAt = stringValue(event.occurred_at);
    const data = objectValue(event.data);
    if (!eventId || !eventType || !occurredAt || !data) return json({ error: "Malformed Paddle event." }, 400);

    const service = serviceClient();
    if (eventType.startsWith("subscription.")) {
      const accepted = new Set([
        "subscription.created",
        "subscription.activated",
        "subscription.updated",
        "subscription.trialing",
        "subscription.past_due",
        "subscription.paused",
        "subscription.resumed",
        "subscription.canceled",
      ]);
      if (accepted.has(eventType)) {
        const applied = await syncSubscription(service, eventId, occurredAt, data);
        return json({ received: true, applied });
      }
    }

    // transaction.completed remains useful audit/analytics evidence in Paddle, but
    // GameSignal grants subscription entitlements from authoritative subscription
    // lifecycle events so a completed one-off transaction can never unlock a plan.
    return json({ received: true, ignored: true });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Paddle webhook processing failed." }, 500);
  }
});
