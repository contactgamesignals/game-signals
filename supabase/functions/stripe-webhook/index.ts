import { createClient } from "npm:@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json" };

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
        if (subscriptionId) update.stripe_subscription_id = subscriptionId;
        if (customerId) update.stripe_customer_id = customerId;
        if (isPaidPlan(metadata.plan)) update.plan = metadata.plan;
        const { error } = await service.from("subscriptions").update(update).eq("workspace_id", workspaceId);
        if (error) throw error;
      }
    }

    return json({ received: true });
  } catch (error) {
    console.error(error);
    return json({ error: "Webhook processing failed." }, 500);
  }
});
