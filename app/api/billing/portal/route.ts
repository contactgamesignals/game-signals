import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, isStripeServerConfigured, stripeRequest } from "@/lib/stripe";

type PortalSession = {
  url: string;
};

export async function POST() {
  if (!isStripeServerConfigured()) {
    return NextResponse.json({ error: "Stripe billing is not configured yet." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

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

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();

  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer exists for this workspace yet." }, { status: 400 });
  }

  const params = new URLSearchParams();
  params.set("customer", subscription.stripe_customer_id);
  params.set("return_url", `${getSiteUrl()}/dashboard/settings`);

  try {
    const session = await stripeRequest<PortalSession>("/billing_portal/sessions", {
      method: "POST",
      body: params,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open the Stripe billing portal.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
