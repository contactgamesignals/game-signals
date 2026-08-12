const STRIPE_API_BASE = "https://api.stripe.com/v1";

export function isStripeServerConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isStripeWebhookConfigured() {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://game-signals.vercel.app").replace(/\/$/, "");
}

type StripeErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

export async function stripeRequest<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: URLSearchParams;
  } = {},
): Promise<T> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("Stripe is not configured on the server.");

  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: options.body,
    cache: "no-store",
  });

  const payload = (await response.json()) as T & StripeErrorPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `Stripe request failed with HTTP ${response.status}.`);
  }

  return payload;
}
