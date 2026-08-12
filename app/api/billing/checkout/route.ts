import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  STRIPE_PRICE_LOOKUP_KEYS,
  isBillingPeriod,
  isPaidPlan,
} from "@/lib/plans";
import { getSiteUrl, isStripeServerConfigured, stripeRequest } from "@/lib/stripe";

type PriceList = {
  data: Array<{ id: string; lookup_key: string | null }>;
};

type CheckoutSession = {
  id: string;
  url: string | null;
};

export async function POST(request: Request) {
  if (!isStripeServerConfigured()) {
    return NextResponse.json({ error: "Stripe billing is not configured yet." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const input = body as { plan?: unknown; period?: unknown };
  if (!isPaidPlan(input.plan) || !isBillingPeriod(input.period)) {
    return NextResponse.json({ error: "Invalid billing plan or period." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Only workspace owners and admins can manage billing." }, { status: 403 });
  }

  const workspaceId = membership.workspace_id as string;
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const alreadyPaid =
    subscription &&
    subscription.plan !== "free" &&
    (subscription.status === "active" || subscription.status === "trialing");

  if (alreadyPaid) {
    return NextResponse.json(
      { error: "This workspace already has a paid subscription. Use Manage billing to change it.", usePortal: true },
      { status: 409 },
    );
  }

  const lookupKey = STRIPE_PRICE_LOOKUP_KEYS[input.plan][input.period];
  const prices = await stripeRequest<PriceList>(
    `/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(lookupKey)}`,
  );
  const price = prices.data[0];
  if (!price) {
    return NextResponse.json({ error: `Stripe price ${lookupKey} was not found.` }, { status: 503 });
  }

  const siteUrl = getSiteUrl();
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", price.id);
  params.set("line_items[0][quantity]", "1");
  params.set("success_url", `${siteUrl}/dashboard/settings?billing=success`);
  params.set("cancel_url", `${siteUrl}/dashboard/settings?billing=cancelled`);
  params.set("client_reference_id", workspaceId);
  params.set("allow_promotion_codes", "true");
  params.set("billing_address_collection", "auto");
  params.set("metadata[workspace_id]", workspaceId);
  params.set("metadata[plan]", input.plan);
  params.set("metadata[billing_period]", input.period);
  params.set("subscription_data[metadata][workspace_id]", workspaceId);
  params.set("subscription_data[metadata][plan]", input.plan);
  params.set("subscription_data[metadata][billing_period]", input.period);

  if (subscription?.stripe_customer_id) {
    params.set("customer", subscription.stripe_customer_id);
  } else if (user.email) {
    params.set("customer_email", user.email);
  }

  try {
    const session = await stripeRequest<CheckoutSession>("/checkout/sessions", {
      method: "POST",
      body: params,
    });

    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create Stripe Checkout.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
