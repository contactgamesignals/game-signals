import "server-only";

import { issueFrozenSellerDocumentToKsef } from "@/lib/ksef/issuance-orchestrator";
import { createKsefOnlineIssuanceTransport } from "@/lib/ksef/online-issuance-transport";
import { reconcilePendingSellerDocument } from "@/lib/ksef/reconciliation";
import {
  assertFrozenFa3Integrity,
  prepareFrozenSellerDocumentFa3,
} from "@/lib/ksef/seller-document-preparation";
import type { SellerDocumentFa3Snapshot } from "@/lib/ksef/seller-document-fa3";
import { createSellerDocumentKsefStateAdapter } from "@/lib/ksef/seller-document-state";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type DurableSellerDocument = SellerDocumentFa3Snapshot & {
  id: string;
  fa3_xml: string | null;
  fa3_sha256: string | null;
  fa3_size_bytes: number | null;
  fa3_generated_at: string | null;
  fa3_generator_version: string | null;
  ksef_session_reference: string | null;
  ksef_invoice_reference: string | null;
  ksef_reference_number: string | null;
};

const SELLER_DOCUMENT_SELECT = [
  "id",
  "source_livemode",
  "lifecycle_status",
  "legal_document_number",
  "stripe_invoice_id",
  "seller_nip",
  "seller_name",
  "seller_address",
  "buyer_type",
  "buyer_name",
  "buyer_country",
  "buyer_address",
  "buyer_tax_ids",
  "currency",
  "net_amount",
  "tax_amount",
  "gross_amount",
  "issue_date",
  "service_period_start",
  "service_period_end",
  "fa3_xml",
  "fa3_sha256",
  "fa3_size_bytes",
  "fa3_generated_at",
  "fa3_generator_version",
  "ksef_session_reference",
  "ksef_invoice_reference",
  "ksef_reference_number",
].join(",");

function requiredId(value: string) {
  const normalized = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw new Error("sellerDocumentId must be a UUID.");
  }
  return normalized;
}

async function loadSellerDocument(documentId: string): Promise<DurableSellerDocument> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("billing_seller_documents")
    .select(SELLER_DOCUMENT_SELECT)
    .eq("id", requiredId(documentId))
    .maybeSingle();
  if (error) throw new Error(`Could not load seller document: ${error.message}`);
  if (!data) throw new Error("Seller document not found.");
  return data as unknown as DurableSellerDocument;
}

async function reserveLegalNumber(documentId: string, series: string) {
  const normalizedSeries = series.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,16}$/.test(normalizedSeries)) throw new Error("Invalid seller-document number series.");
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("reserve_seller_document_number", {
    p_document_id: documentId,
    p_series: normalizedSeries,
  });
  if (error) throw new Error(`Could not reserve seller-document number: ${error.message}`);
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("Seller-document number reservation returned an invalid result.");
  }
  const row = data[0] as Record<string, unknown>;
  if (typeof row.document_number !== "string" || !row.document_number.trim()) {
    throw new Error("Seller-document number reservation did not return a document number.");
  }
  return row.document_number.trim();
}

async function frozenResult(document: DurableSellerDocument) {
  if (!document.fa3_xml || !document.fa3_sha256 || !document.fa3_size_bytes) return null;
  await assertFrozenFa3Integrity({
    xml: document.fa3_xml,
    sha256: document.fa3_sha256,
    sizeBytes: document.fa3_size_bytes,
  });
  return document;
}

/**
 * Prepare exactly one LIVE seller document for KSeF. Number reservation and
 * FA(3) freezing are both idempotent in PostgreSQL. No KSeF network call occurs.
 */
export async function prepareSellerDocumentForKsef(
  sellerDocumentId: string,
  series = "GS",
): Promise<DurableSellerDocument> {
  const documentId = requiredId(sellerDocumentId);
  let document = await loadSellerDocument(documentId);

  if (!document.source_livemode) throw new Error("Legal KSeF preparation is forbidden for Stripe sandbox documents.");
  if (document.ksef_reference_number || document.lifecycle_status === "ksef_accepted") {
    throw new Error("Seller document is already accepted by KSeF.");
  }

  const existingFrozen = await frozenResult(document);
  if (existingFrozen) return existingFrozen;

  if (document.lifecycle_status !== "ready_for_issue") {
    throw new Error("Seller document must be ready_for_issue before first FA(3) preparation.");
  }

  if (!document.legal_document_number) {
    await reserveLegalNumber(documentId, series);
    document = await loadSellerDocument(documentId);
  }

  const frozenAfterReservation = await frozenResult(document);
  if (frozenAfterReservation) return frozenAfterReservation;

  const prepared = await prepareFrozenSellerDocumentFa3(document);
  if (prepared.invoiceNumber !== document.legal_document_number) {
    throw new Error("Prepared FA(3) invoice number does not match the reserved seller-document number.");
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("freeze_seller_document_fa3", {
    p_document_id: documentId,
    p_fa3_xml: prepared.xml,
    p_fa3_sha256: prepared.sha256,
    p_fa3_size_bytes: prepared.sizeBytes,
    p_fa3_generated_at: prepared.generatedAt,
    p_generator_version: prepared.generatorVersion,
  });

  if (error) {
    // Concurrent preparation can legitimately lose the write-once race because
    // each worker has a different generatedAt. Reload and accept only an
    // already-frozen payload that independently passes integrity verification.
    if (!/already frozen/i.test(error.message)) {
      throw new Error(`Could not freeze seller-document FA(3): ${error.message}`);
    }
    const concurrent = await loadSellerDocument(documentId);
    const concurrentFrozen = await frozenResult(concurrent);
    if (!concurrentFrozen) throw new Error("Concurrent FA(3) freeze did not leave a valid frozen payload.");
    return concurrentFrozen;
  }

  if (data !== true && data !== false) {
    throw new Error("FA(3) freeze RPC returned an invalid result.");
  }

  const frozen = await loadSellerDocument(documentId);
  const verified = await frozenResult(frozen);
  if (!verified) throw new Error("FA(3) freeze completed without a stored payload.");
  return verified;
}

/**
 * Perform the real KSeF network issuance for one document. This function is
 * intentionally NOT exposed by an API route or scheduler. It still requires
 * KSEF_ENABLED, production unlock where applicable, KSEF_SYSTEM_TOKEN and the
 * Supabase service-role key before any network submission can occur.
 */
export async function issueSellerDocumentToKsef(sellerDocumentId: string) {
  const document = await prepareSellerDocumentForKsef(sellerDocumentId);
  const state = createSellerDocumentKsefStateAdapter();
  const transport = createKsefOnlineIssuanceTransport();
  return issueFrozenSellerDocumentToKsef(document, { ...state, ...transport });
}

/** Reconcile an existing pending session. Never submits a new invoice. */
export async function reconcileSellerDocumentKsef(sellerDocumentId: string) {
  const document = await loadSellerDocument(requiredId(sellerDocumentId));
  return reconcilePendingSellerDocument(document);
}
