import "server-only";

import { createHash } from "node:crypto";

import {
  getKsefInvoiceUpo,
  getKsefSessionInvoiceStatus,
  getKsefSessionInvoicesPage,
} from "@/lib/ksef/online-session";
import {
  matchFrozenSellerDocumentInKsefSession,
  type KsefInvoiceReferenceRecovery,
} from "@/lib/ksef/reconciliation-core";
import {
  createSellerDocumentKsefStateAdapter,
  recordAuthoritativeKsefRejection,
} from "@/lib/ksef/seller-document-state";
import { classifyKsefInvoiceStatus } from "@/lib/ksef/submission-status-core";
import { getKsefAccessTokenForSeller } from "@/lib/ksef/token-auth";

const MAX_SESSION_INVOICE_PAGES = 100;
const SESSION_INVOICE_PAGE_SIZE = 100;

export type PendingSellerDocumentForKsefReconciliation = {
  id: string;
  source_livemode: boolean;
  lifecycle_status: string;
  legal_document_number: string | null;
  fa3_sha256: string | null;
  ksef_session_reference: string | null;
  ksef_invoice_reference: string | null;
};

export type KsefReconciliationResult =
  | { kind: "processing"; invoiceReference: string }
  | { kind: "accepted"; invoiceReference: string; ksefReferenceNumber: string }
  | { kind: "rejected"; invoiceReference: string; statusCode: number }
  | { kind: "duplicate"; invoiceReference: string; originalKsefNumber: string | null }
  | { kind: "invoice_reference_not_found" }
  | { kind: "invoice_reference_ambiguous"; matchingReferenceNumbers: string[] }
  | { kind: "unknown_status"; invoiceReference: string; statusCode: number };

function required(value: string | null, field: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${field} is required for KSeF reconciliation.`);
  return normalized;
}

async function listAllSessionInvoices(input: {
  accessToken: string;
  sessionReference: string;
}) {
  const invoices: unknown[] = [];
  let continuationToken: string | null = null;
  const seenTokens = new Set<string>();

  for (let page = 0; page < MAX_SESSION_INVOICE_PAGES; page += 1) {
    const response = await getKsefSessionInvoicesPage({
      accessToken: input.accessToken,
      sessionReferenceNumber: input.sessionReference,
      continuationToken,
      pageSize: SESSION_INVOICE_PAGE_SIZE,
    });
    if (response.invoices !== undefined && response.invoices !== null && !Array.isArray(response.invoices)) {
      throw new Error("KSeF session invoice list is invalid.");
    }
    invoices.push(...(response.invoices ?? []));

    const next = typeof response.continuationToken === "string" && response.continuationToken.trim()
      ? response.continuationToken.trim()
      : null;
    if (!next) return invoices;
    if (seenTokens.has(next)) throw new Error("KSeF session invoice pagination repeated a continuation token.");
    seenTokens.add(next);
    continuationToken = next;
  }

  throw new Error("KSeF session invoice pagination exceeded the safety limit.");
}

export async function recoverKsefInvoiceReference(input: {
  accessToken: string;
  sessionReference: string;
  legalDocumentNumber: string;
  frozenFa3Sha256Hex: string;
}): Promise<KsefInvoiceReferenceRecovery> {
  const invoices = await listAllSessionInvoices({
    accessToken: input.accessToken,
    sessionReference: input.sessionReference,
  });
  return matchFrozenSellerDocumentInKsefSession({
    legalDocumentNumber: input.legalDocumentNumber,
    frozenFa3Sha256Hex: input.frozenFa3Sha256Hex,
    invoices,
  });
}

/**
 * Reconcile exactly one pending LIVE seller document against its existing KSeF
 * session. This function never opens a new session and never submits an invoice.
 */
export async function reconcilePendingSellerDocument(
  document: PendingSellerDocumentForKsefReconciliation,
): Promise<KsefReconciliationResult> {
  if (!document.source_livemode) throw new Error("KSeF reconciliation is forbidden for Stripe sandbox documents.");
  if (document.lifecycle_status !== "ksef_pending") {
    throw new Error("Only ksef_pending seller documents can be reconciled.");
  }

  const documentId = required(document.id, "documentId");
  const expectedSha256 = required(document.fa3_sha256, "frozen FA(3) SHA-256").toLowerCase();
  const legalDocumentNumber = required(document.legal_document_number, "legal document number");
  const sessionReference = required(document.ksef_session_reference, "KSeF session reference");
  const accessToken = await getKsefAccessTokenForSeller();
  const state = createSellerDocumentKsefStateAdapter();

  let invoiceReference = document.ksef_invoice_reference?.trim() || null;
  if (!invoiceReference) {
    const recovery = await recoverKsefInvoiceReference({
      accessToken,
      sessionReference,
      legalDocumentNumber,
      frozenFa3Sha256Hex: expectedSha256,
    });

    if (recovery.kind === "not_found") {
      await state.recordReconciliationError({
        documentId,
        expectedSha256,
        error: "Existing KSeF session does not yet expose an invoice matching both the frozen FA(3) hash and legal document number.",
        statusCode: null,
      });
      return { kind: "invoice_reference_not_found" };
    }

    if (recovery.kind === "ambiguous") {
      await state.recordReconciliationError({
        documentId,
        expectedSha256,
        error: "KSeF session contains more than one invoice matching the same legal document number and frozen FA(3) hash; manual reconciliation is required.",
        statusCode: null,
      });
      return {
        kind: "invoice_reference_ambiguous",
        matchingReferenceNumbers: recovery.matchingReferenceNumbers,
      };
    }

    invoiceReference = recovery.referenceNumber;
    await state.recordReferences({
      documentId,
      expectedSha256,
      sessionReference,
      invoiceReference,
      statusCode: null,
    });
  }

  const rawStatus = await getKsefSessionInvoiceStatus({
    accessToken,
    sessionReferenceNumber: sessionReference,
    invoiceReferenceNumber: invoiceReference,
  });
  const status = classifyKsefInvoiceStatus(rawStatus);

  if (status.kind === "processing") {
    return { kind: "processing", invoiceReference };
  }

  if (status.kind === "accepted") {
    const upoXml = await getKsefInvoiceUpo({
      accessToken,
      sessionReferenceNumber: sessionReference,
      invoiceReferenceNumber: invoiceReference,
    });
    if (!upoXml.trim()) throw new Error("KSeF returned an empty UPO during reconciliation.");
    const upoSha256 = createHash("sha256").update(Buffer.from(upoXml, "utf8")).digest("hex");
    await state.recordAcceptance({
      documentId,
      expectedSha256,
      ksefReferenceNumber: status.ksefNumber,
      statusCode: status.statusCode,
      upoXml,
      upoSha256,
      acceptedAt: status.acquisitionDate,
    });
    return {
      kind: "accepted",
      invoiceReference,
      ksefReferenceNumber: status.ksefNumber,
    };
  }

  if (status.kind === "duplicate") {
    await state.recordReconciliationError({
      documentId,
      expectedSha256,
      error: `KSeF duplicate status 440. Original session=${status.originalSessionReferenceNumber ?? "unknown"}; original KSeF number=${status.originalKsefNumber ?? "unknown"}.`,
      statusCode: status.statusCode,
    });
    return {
      kind: "duplicate",
      invoiceReference,
      originalKsefNumber: status.originalKsefNumber,
    };
  }

  if (status.kind === "rejected") {
    await recordAuthoritativeKsefRejection({
      documentId,
      expectedSha256,
      statusCode: status.statusCode,
      error: `KSeF authoritative rejection ${status.statusCode}${status.description ? `: ${status.description}` : "."}`,
    });
    return { kind: "rejected", invoiceReference, statusCode: status.statusCode };
  }

  await state.recordReconciliationError({
    documentId,
    expectedSha256,
    error: `KSeF returned unrecognized invoice status ${status.statusCode}; no retry was attempted.`,
    statusCode: status.statusCode,
  });
  return { kind: "unknown_status", invoiceReference, statusCode: status.statusCode };
}
