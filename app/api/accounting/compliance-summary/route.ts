import { NextResponse } from "next/server";
import { deriveBillingCompliance, SELLER_TAX_PROFILE } from "@/lib/billing-compliance";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", authData.user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json({ error: "Only workspace owners and admins can view billing compliance." }, { status: 403 });
  }

  const { data: records, error } = await supabase
    .from("billing_invoice_records")
    .select("stripe_invoice_id, invoice_number, buyer_type, jurisdiction_bucket, customer_country, customer_tax_ids, total_amount, currency, livemode, invoice_created_at")
    .eq("workspace_id", membership.workspace_id)
    .order("invoice_created_at", { ascending: false })
    .limit(10000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const routed = (records ?? []).map((record) => ({
    stripe_invoice_id: record.stripe_invoice_id,
    invoice_number: record.invoice_number,
    customer_country: record.customer_country,
    customer_tax_ids: record.customer_tax_ids,
    total_amount: record.total_amount,
    currency: record.currency,
    stripe_mode: record.livemode ? "live" : "sandbox",
    invoice_created_at: record.invoice_created_at,
    ...deriveBillingCompliance({
      buyerType: record.buyer_type,
      jurisdictionBucket: record.jurisdiction_bucket,
    }),
  }));

  const counts = routed.reduce(
    (summary, record) => {
      summary.total += 1;
      summary.by_route[record.taxRoute] = (summary.by_route[record.taxRoute] ?? 0) + 1;
      summary.by_readiness[record.liveReadiness] = (summary.by_readiness[record.liveReadiness] ?? 0) + 1;
      if (record.accountingReviewRequired) summary.accounting_review_required += 1;
      return summary;
    },
    {
      total: 0,
      accounting_review_required: 0,
      by_route: {} as Record<string, number>,
      by_readiness: {} as Record<string, number>,
    },
  );

  return NextResponse.json(
    {
      generated_at: new Date().toISOString(),
      seller: SELLER_TAX_PROFILE,
      counts,
      records: routed,
      note: "Compliance routing is an accounting workflow aid. It does not itself calculate VAT or submit invoices to KSeF.",
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
