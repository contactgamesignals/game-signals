import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function safeCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
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
    return NextResponse.json({ error: "Only workspace owners and admins can export billing adjustments." }, { status: 403 });
  }

  const { data: records, error } = await supabase
    .from("billing_adjustment_records")
    .select("adjustment_type, stripe_object_id, stripe_invoice_id, stripe_charge_id, stripe_customer_id, document_number, status, reason, currency, amount, pre_payment_amount, post_payment_amount, effective_at, voided_at, document_pdf, livemode, needs_accounting_review, created_at")
    .eq("workspace_id", membership.workspace_id)
    .order("created_at", { ascending: false })
    .limit(10000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const headers = [
    "record_created_at",
    "adjustment_type",
    "stripe_object_id",
    "stripe_invoice_id",
    "stripe_charge_id",
    "stripe_customer_id",
    "document_number",
    "status",
    "reason",
    "currency",
    "amount_minor",
    "pre_payment_amount_minor",
    "post_payment_amount_minor",
    "effective_at",
    "voided_at",
    "stripe_mode",
    "needs_accounting_review",
    "document_pdf",
  ];

  const rows = (records ?? []).map((record) => [
    record.created_at,
    record.adjustment_type,
    record.stripe_object_id,
    record.stripe_invoice_id,
    record.stripe_charge_id,
    record.stripe_customer_id,
    record.document_number,
    record.status,
    record.reason,
    record.currency,
    record.amount,
    record.pre_payment_amount,
    record.post_payment_amount,
    record.effective_at,
    record.voided_at,
    record.livemode ? "live" : "sandbox",
    record.needs_accounting_review ? "yes" : "no",
    record.document_pdf,
  ].map(safeCell).join(","));

  const csv = `\uFEFF${headers.map(safeCell).join(",")}\r\n${rows.join("\r\n")}`;
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gamesignal-billing-adjustments-${date}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
