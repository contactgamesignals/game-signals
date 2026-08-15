import { createClient } from "npm:@supabase/supabase-js@2";
import {
  assertStripePayloadMode,
  requireStripeRuntimeMode,
} from "../_shared/stripe-runtime-mode.ts";

const headers = { "Content-Type": "application/json" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers });
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase service environment is missing.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

function hexToBytes(hex: string) {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
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
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`)),
  );

  return signatures.some((signature) => {
    const actual = hexToBytes(signature);
    return actual ? constantTimeEqual(actual, digest) : false;
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const stripeMode = requireStripeRuntimeMode();
    if (stripeMode.livemode) {
      return json({
        error: "Webhook runtime smoke test is intentionally sandbox-only.",
        stripe_mode: stripeMode.label,
      }, 409);
    }

    const service = serviceClient();
    const { data: webhookSecret, error: secretError } = await service.rpc("get_internal_vault_secret", {
      secret_name: stripeMode.webhookVaultSecretName,
    });
    if (secretError || typeof webhookSecret !== "string" || !webhookSecret) {
      return json({ error: "Webhook secret unavailable." }, 503);
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) return json({ error: "Missing Stripe signature." }, 400);
    const rawBody = await request.text();
    if (!(await verifyStripeSignature(rawBody, signature, webhookSecret))) {
      return json({ error: "Invalid Stripe signature." }, 400);
    }

    const event = JSON.parse(rawBody) as {
      id?: unknown;
      type?: unknown;
      livemode?: unknown;
      data?: { object?: Record<string, unknown> };
    };
    const object = event.data?.object;
    if (typeof event.id !== "string" || !event.id) throw new Error("Stripe event is missing id.");
    if (typeof event.type !== "string" || !event.type) throw new Error("Stripe event is missing type.");
    if (typeof event.livemode !== "boolean") throw new Error("Stripe event is missing livemode evidence.");
    if (!object || typeof object.livemode !== "boolean") {
      throw new Error("Stripe event object is missing livemode evidence.");
    }

    assertStripePayloadMode(event, stripeMode.livemode, "Stripe event");
    assertStripePayloadMode(object, stripeMode.livemode, "Stripe event object");

    return json({
      ok: true,
      mode: "signature_and_livemode_check_only",
      stripe_mode: stripeMode.label,
      livemode: stripeMode.livemode,
      event_verified: true,
      mutation_performed: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook runtime smoke test failed.";
    const status = /LIVE billing is locked|Stripe secret|runtime mode/.test(message)
      ? 503
      : /livemode/.test(message)
        ? 409
        : 400;
    return json({ error: message.slice(0, 300) }, status);
  }
});
