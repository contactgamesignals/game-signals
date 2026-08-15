import { NextRequest, NextResponse } from "next/server";
import { buildFa3FromSellerDocumentSnapshot } from "@/lib/ksef/seller-document-fa3";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ error: "Only workspace owners and admins can preview seller documents." }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { seller_document_id?: unknown } | null;
  const documentId = typeof body?.seller_document_id === "string" ? body.seller_document_id : "";
  if (!documentId) return NextResponse.json({ error: "seller_document_id is required." }, { status: 400 });

  const { data: document, error } = await supabase
    .from("billing_seller_documents")
    .select("id, source_livemode, lifecycle_status, legal_document_number, stripe_invoice_id, seller_nip, seller_name, seller_address, buyer_type, buyer_name, buyer_country, buyer_address, buyer_tax_ids, currency, net_amount, tax_amount, gross_amount, issue_date, service_period_start, service_period_end")
    .eq("id", documentId)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!document) return NextResponse.json({ error: "Seller document not found." }, { status: 404 });
  if (document.source_livemode) {
    return NextResponse.json({ error: "This endpoint is sandbox-preview-only and cannot render a LIVE legal document." }, { status: 409 });
  }

  try {
    const draft = buildFa3FromSellerDocumentSnapshot(document, {
      generatedAt: new Date().toISOString(),
    });

    return new NextResponse(draft.xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="gamesignal-seller-document-preview-${document.id}.xml"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "X-GameSignal-Document-Mode": "sandbox-seller-snapshot-preview-only",
      },
    });
  } catch (previewError) {
    return NextResponse.json(
      { error: previewError instanceof Error ? previewError.message : "Could not generate seller-document FA(3) preview." },
      { status: 422 },
    );
  }
}
