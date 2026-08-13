import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { deriveBillingCompliance, SELLER_TAX_PROFILE } from "@/lib/billing-compliance";

export const dynamic = "force-dynamic";

function safeCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function taxIdsCell(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return "";
      const taxId = entry as Record<string, unknown>;
      const type = typeof taxId.type === "string" ? taxId.type : "";
      const id = typeof taxId.value === "string" ? taxId.value : "";
      const verification = typeof taxId.verification_status === "string" ? taxId.verification_status : "";
      return [type, id, verification].filter(Boolean).join(":");
    })
    .filter(Boolean)
    .join(" | ");
}

function addressCell(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const address = value as Record<string, unknown>;
  return [address.line1, address.line2, address.postal_code, address.city, address.state, address.country]
    .filter((part) => typeof part === "string" && part.trim())
    .join(", ");
}

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
    return NextResponse.json({ error: "Only workspace owners and admins can export billing records." }, { status: 403 });
  }

  const { data: records, error } = await supabase
    .from("billing_invoice_records")
    .select("invoice_created_at, invoice_number, stripe_invoice_id, stripe_status, buyer_type, jurisdiction_bucket, customer_country, customer_name, customer_email, customer_address, customer_tax_ids, currency, subtotal_amount, discount_amount, tax_amount, total_amount, amount_paid, amount_remaining, period_start, period_end, livemode, hosted_invoice_url, invoice_pdf")
    .eq("workspace_id", membership.workspace_id)
    .order("invoice_created_at", { ascending: false })
    .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headers = [
    "invoice_created_at",
    "invoice_number",
    "stripe_invoice_id",
    "status",
    "buyer_type",
    "jurisdiction_bucket",
    "customer_country",
    "customer_name",
    "customer_email",
    "customer_address",
    "customer_tax_ids",
    "currency",
    "subtotal_minor",
    "discount_minor",
    "tax_minor",
    "total_minor",
    "amount_paid_minor",
    "amount_remaining_minor",
    "service_period_start",
    "service_period_end",
    "stripe_mode",
    "seller_vat_status",
    "tax_route",
    "vat_action",
    "vat_ue_action",
    "sme_action",
    "ksef_action",
    "live_readiness",
    "accounting_review_required",
    "hosted_invoice_url",
    "invoice_pdf",
  ];

  const rows = (records ?? []).map((record) => {
    const compliance = deriveBillingCompliance({
      buyerType: record.buyer_type,
      jurisdictionBucket: record.jurisdiction_bucket,
    });

    return [
      record.invoice_created_at,
      record.invoice_number,
      record.stripe_invoice_id,
      record.stripe_status,
      record.buyer_type,
      record.jurisdiction_bucket,
      record.customer_country,
      record.customer_name,
      record.customer_email,
      addressCell(record.customer_address),
      taxIdsCell(record.customer_tax_ids),
      record.currency,
      record.subtotal_amount,
      record.discount_amount,
      record.tax_amount,
      record.total_amount,
      record.amount_paid,
      record.amount_remaining,
      record.period_start,
      record.period_end,
      record.livemode ? "live" : "sandbox",
      SELLER_TAX_PROFILE.vatStatus,
      compliance.taxRoute,
      compliance.vatAction,
      compliance.vatUeAction,
      compliance.smeAction,
      compliance.ksefAction,
      compliance.liveReadiness,
      compliance.accountingReviewRequired ? "yes" : "no",
      record.hosted_invoice_url,
      record.invoice_pdf,
    ].map(safeCell).join(",");
  });

  const csv = `\uFEFF${headers.map(safeCell).join(",")}\r\n${rows.join("\r\n")}`;
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gamesignal-billing-ledger-${date}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
