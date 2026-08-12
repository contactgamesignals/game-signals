import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPaidPlan } from "@/lib/plans";

export const runtime = "nodejs";

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

function verifyStripeSignature(payload: string, header: string, secret: string) {
  const parts = header.split(",");
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return signatures.some((signature) => {
    try {
      const actualBuffer = Buffer.from(signature, "hex");
      return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
    } catch {
      return false;
    }
  });
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metadataOf(object: Record<string, unknown>) {
  return objectValue(object.metadata) ?? {};
}

function idFromExpandable(value: unknown) {
  if (typeof value === "string") return value;
  return stringValue(objectValue(value)?.id);
}

function mapStripeStatus(value: unknown): SubscriptionStatus {
  if (value === "trialing" || value === "active" || value === "past_due" || value === "canceled" || value === "incomplete") {
    return value;
  }
  if (value === "incomplete_expired") return "canceled";
  if (value === "unpaid" || value === "paused") return "past_due";
  return "incomplete";
}

function currentPeriodEnd(object: Record<string, unknown>) {
  const direct = object.current_period_end;
  if (typeof direct === "number") return new Date(direct * 1000).toISOString();

  const items = objectValue(object.items);
  const data = Array.isArray(items?.data) ? items.data : [];
  const first = data.length > 0 ? objectValue(data[0]) : null;
  const itemEnd = first?.current_period_end;
  return typeof itemEnd === "number" ? new Date(itemEnd * 1000).toISOString() : null;
}

async function syncSubscription(object: Record<string, unknown>) {
  const admin = createAdminClient();
  const metadata = metadataOf(object);
  const workspaceFromMetadata = stringValue(metadata.workspace_id);
  const stripeSubscriptionId = stringValue(object.id);
  const stripeCustomerId = idFromExpandable(object.customer);
  const plan = isPaidPlan(metadata.plan) ? metadata.plan : null;

  let workspaceId = workspaceFromMetadata;
  if (!workspaceId && stripeSubscriptionId) {
    const { data } = await admin
      .from("subscriptions")
      .select("workspace_id")
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .maybeSingle();
    workspaceId = data?.workspace_id ?? null;
  }

  if (!workspaceId) return;

  const update: Record<string, unknown> = {
    status: mapStripeStatus(object.status),
    cancel_at_period_end: Boolean(object.cancel_at_period_end),
    current_period_end: currentPeriodEnd(object),
    updated_at: new Date().toISOString(),
  };
  if (stripeSubscriptionId) update.stripe_subscription_id = stripeSubscriptionId;
  if (stripeCustomerId) update.stripe_customer_id = stripeCustomerId;
  if (plan) update.plan = plan;

  const { error } = await admin.from("subscriptions").update(update).eq("workspace_id", workspaceId);
  if (error) throw error;
}

async function syncCheckout(object: Record<string, unknown>) {
  if (object.mode !== "subscription") return;

  const metadata = metadataOf(object);
  const workspaceId = stringValue(metadata.workspace_id) ?? stringValue(object.client_reference_id);
  const plan = isPaidPlan(metadata.plan) ? metadata.plan : null;
  if (!workspaceId || !plan) return;

  const stripeCustomerId = idFromExpandable(object.customer);
  const stripeSubscriptionId = idFromExpandable(object.subscription);
  const paymentStatus = stringValue(object.payment_status);
  const status: SubscriptionStatus =
    paymentStatus === "paid" || paymentStatus === "no_payment_required" ? "active" : "incomplete";

  const admin = createAdminClient();
  const update: Record<string, unknown> = {
    plan,
    status,
    updated_at: new Date().toISOString(),
  };
  if (stripeCustomerId) update.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId) update.stripe_subscription_id = stripeSubscriptionId;

  const { error } = await admin.from("subscriptions").update(update).eq("workspace_id", workspaceId);
  if (error) throw error;
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  const rawBody = await request.text();
  if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await syncCheckout(event.data.object);
    } else if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncSubscription(event.data.object);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook sync failed", event.id, event.type, error);
    return NextResponse.json({ error: "Webhook sync failed." }, { status: 500 });
  }
}
