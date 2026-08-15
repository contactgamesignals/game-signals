import { NextRequest, NextResponse } from "next/server";
import { buildFa3StandardVatPolishB2bInvoice } from "@/lib/ksef/fa3-active-vat";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function findPolishNip(value: unknown) {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const taxId = entry as Record<string, unknown>;
    const type = typeof taxId.type === "string" ? taxId.type : "";
    const raw = typeof taxId.value === "string" ? taxId.value : "";
    const normalized = raw.replace(/\D/g, "");
    if ((type === "pl_nip" || type === "eu_vat") && normalized.length === 10) return normalized;
  }
  return null;
}

function stripeAddress(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const address = value as Record<string, unknown>;
  const countryCode = typeof address.country === "string" ? address.country.toUpperCase() : "";
  const parts = [address.line1, address.postal_code, address.city]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  const line2 = typeof address.line2 === "string" && address.line2.trim() ? address.line2.trim() : null;
  if (!countryCode || parts.length === 0) return null;
  return { countryCode, line1: parts.join(", "), line2 };
}

function safePreviewNumber(stripeInvoiceId: string, issueDate: string) {
  const suffix = stripeInvoiceId.replace(/[^A-Za-z0-9_-]/g, "").slice(-24) || "SANDBOX";
  return `PREVIEW/${issueDate.replaceAll("-", "")}/${suffix}`;
}

export async function POST(request: NextRequest) {
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
    return NextResponse.json({ error: "Only workspace owners and admins can preview accounting documents." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as {
    billing_invoice_record_id?: unknown;
  } | null;

  const recordId = typeof body?.billing_invoice_record_id === "string" ? body.billing_invoice_record_id : "";
  if (!recordId) return NextResponse.json({ error: "billing_invoice_record_id is required." }, { status: 400 });

  const { data: record, error } = await supabase
    .from("billing_invoice_records")
    .select("id, stripe_invoice_id, buyer_type, jurisdiction_bucket, customer_name, customer_country, customer_address, customer_tax_ids, currency, subtotal_amount, tax_amount, total_amount, invoice_created_at, period_start, period_end, livemode")
    .eq("id", recordId)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!record) return NextResponse.json({ error: "Billing invoice record not found." }, { status: 404 });

  // This endpoint is deliberately a sandbox document preview. It cannot be
  // used as an accidental production invoice issuance path.
  if (record.livemode) {
    return NextResponse.json({ error: "KSeF preview is locked for Stripe LIVE records." }, { status: 409 });
  }
  if (record.buyer_type !== "company" || record.jurisdiction_bucket !== "pl") {
    return NextResponse.json({ error: "The first active-VAT FA(3) preview supports only Polish Company records." }, { status: 409 });
  }
  if (String(record.currency ?? "").toLowerCase() !== "pln") {
    return NextResponse.json({ error: "The first active-VAT FA(3) preview supports only PLN records." }, { status: 409 });
  }
  if (!record.customer_name) {
    return NextResponse.json({ error: "Company legal name is missing from the Stripe billing record." }, { status: 409 });
  }

  const buyerNip = findPolishNip(record.customer_tax_ids);
  if (!buyerNip) {
    return NextResponse.json({ error: "A Polish NIP is required before a domestic B2B FA(3) preview can be generated." }, { status: 409 });
  }

  const grossAmountMinor = Number(record.total_amount);
  const stripeTaxAmountMinor = Number(record.tax_amount);
  if (!Number.isSafeInteger(grossAmountMinor) || grossAmountMinor <= 0) {
    return NextResponse.json({ error: "The Stripe billing amount is not valid for an invoice preview." }, { status: 409 });
  }
  if (!Number.isSafeInteger(stripeTaxAmountMinor) || stripeTaxAmountMinor <= 0) {
    return NextResponse.json({ error: "A positive Stripe VAT amount is required for the active-VAT domestic preview." }, { status: 409 });
  }

  const issueDate = typeof record.invoice_created_at === "string"
    ? record.invoice_created_at.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const createdAt = new Date().toISOString();
  const buyerAddress = stripeAddress(record.customer_address);

  try {
    const draft = buildFa3StandardVatPolishB2bInvoice({
      invoiceNumber: safePreviewNumber(record.stripe_invoice_id, issueDate),
      issueDate,
      createdAt,
      buyer: {
        nip: buyerNip,
        name: record.customer_name,
        address: buyerAddress,
      },
      serviceName: "GameSignal subscription",
      grossAmountMinor,
      currency: "PLN",
      servicePeriod: record.period_start && record.period_end
        ? { from: String(record.period_start).slice(0, 10), to: String(record.period_end).slice(0, 10) }
        : null,
      stripeInvoiceId: record.stripe_invoice_id,
    });

    if (draft.vatAmountMinor !== stripeTaxAmountMinor) {
      return NextResponse.json(
        {
          error: "Stripe VAT and FA(3) VAT do not match. Document generation is blocked for accounting review.",
          stripe_vat_amount_minor: stripeTaxAmountMinor,
          fa3_vat_amount_minor: draft.vatAmountMinor,
        },
        { status: 409 },
      );
    }

    return new NextResponse(draft.xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="gamesignal-fa3-preview-${record.id}.xml"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-GameSignal-Document-Mode": "sandbox-preview-only",
      },
    });
  } catch (previewError) {
    return NextResponse.json(
      { error: previewError instanceof Error ? previewError.message : "Could not generate FA(3) preview." },
      { status: 422 },
    );
  }
}
