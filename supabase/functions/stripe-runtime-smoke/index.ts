import { createClient } from "npm:@supabase/supabase-js@2";
import {
  requireStripeRuntimeMode,
  STRIPE_RUNTIME_API_VERSION,
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

async function validCronSecret(value: string | null) {
  if (!value) return false;
  const { data, error } = await serviceClient()
    .from("internal_settings")
    .select("value")
    .eq("key", "cron_secret_sha256")
    .maybeSingle();
  if (error || !data?.value) return false;

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hash === String(data.value);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    if (!(await validCronSecret(request.headers.get("x-cron-secret")))) {
      return json({ error: "Forbidden." }, 403);
    }

    const stripeMode = requireStripeRuntimeMode();
    if (stripeMode.livemode) {
      return json({
        error: "Runtime smoke test is intentionally sandbox-only.",
        stripe_mode: stripeMode.label,
      }, 409);
    }

    const response = await fetch("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${stripeMode.secretKey}`,
        "Stripe-Version": STRIPE_RUNTIME_API_VERSION,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || !payload || typeof payload.id !== "string") {
      throw new Error(`Stripe account smoke request failed with HTTP ${response.status}.`);
    }

    return json({
      ok: true,
      mode: "read_only_account_check",
      stripe_mode: stripeMode.label,
      livemode: stripeMode.livemode,
      stripe_api_version: STRIPE_RUNTIME_API_VERSION,
      account_loaded: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stripe runtime smoke test failed.";
    const status = /LIVE billing is locked|Stripe secret|runtime mode/.test(message) ? 503 : 500;
    return json({ error: message.slice(0, 300) }, status);
  }
});
