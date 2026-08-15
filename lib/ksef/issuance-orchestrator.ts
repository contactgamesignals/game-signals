import "server-only";

import { assertFrozenFa3Integrity } from "@/lib/ksef/seller-document-preparation";

export type FrozenSellerDocumentForKsef = {
  id: string;
  source_livemode: boolean;
  lifecycle_status: string;
  legal_document_number: string | null;
  fa3_xml: string | null;
  fa3_sha256: string | null;
  fa3_size_bytes: number | null;
  ksef_reference_number?: string | null;
};

export type KsefAcceptanceResult = {
  ksefReferenceNumber: string;
  statusCode: number;
  upoXml: string;
  acceptedAt: string;
};

export type KsefOpenedSession = {
  sessionReference: string;
  /** In-memory only: may contain AES material/access token; never persist it. */
  sessionHandle: unknown;
};

export type KsefIssuanceDependencies = {
  startAttempt: (documentId: string, expectedSha256: string) => Promise<number>;
  openSession: (input: {
    documentId: string;
    legalDocumentNumber: string;
    sha256: string;
    attemptNumber: number;
  }) => Promise<KsefOpenedSession>;
  submitFrozenFa3: (input: {
    documentId: string;
    legalDocumentNumber: string;
    xml: string;
    sha256: string;
    sizeBytes: number;
    attemptNumber: number;
    sessionReference: string;
    sessionHandle: unknown;
  }) => Promise<{ invoiceReference: string }>;
  closeSession: (input: {
    documentId: string;
    sessionReference: string;
    sessionHandle: unknown;
  }) => Promise<void>;
  waitForAcceptance: (input: {
    documentId: string;
    expectedSha256: string;
    sessionReference: string;
    invoiceReference: string;
    sessionHandle: unknown;
  }) => Promise<KsefAcceptanceResult>;
  recordReferences: (input: {
    documentId: string;
    expectedSha256: string;
    sessionReference: string;
    invoiceReference: string | null;
    statusCode: number | null;
  }) => Promise<boolean>;
  recordReconciliationError: (input: {
    documentId: string;
    expectedSha256: string;
    error: string;
    statusCode: number | null;
  }) => Promise<boolean>;
  recordAcceptance: (input: {
    documentId: string;
    expectedSha256: string;
    ksefReferenceNumber: string;
    statusCode: number;
    upoXml: string;
    upoSha256: string;
    acceptedAt: string;
  }) => Promise<boolean>;
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Utf8(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Unknown KSeF submission error.";
  return raw.trim().slice(0, 4000) || "Unknown KSeF submission error.";
}

/**
 * Runs one KSeF issuance attempt for an already numbered and frozen FA(3).
 *
 * Persistence order is deliberate:
 * 1. mark attempt pending,
 * 2. open KSeF session,
 * 3. persist session reference,
 * 4. only then submit the legal invoice,
 * 5. persist invoice reference before close/poll/UPO.
 *
 * Therefore an ambiguous network failure after invoice submission still leaves
 * enough durable state to reconcile the existing KSeF session instead of
 * blindly creating another legal submission.
 */
export async function issueFrozenSellerDocumentToKsef(
  document: FrozenSellerDocumentForKsef,
  deps: KsefIssuanceDependencies,
) {
  if (!document.source_livemode) throw new Error("KSeF issuance is forbidden for Stripe sandbox documents.");
  if (document.lifecycle_status === "ksef_accepted" || document.ksef_reference_number) {
    throw new Error("Seller document is already accepted by KSeF.");
  }
  if (document.lifecycle_status !== "ready_for_issue" && document.lifecycle_status !== "failed") {
    throw new Error("Seller document is not ready for a KSeF issuance attempt.");
  }
  if (!document.legal_document_number) throw new Error("Legal document number is required before KSeF issuance.");
  if (!document.fa3_xml || !document.fa3_sha256 || !document.fa3_size_bytes) {
    throw new Error("Frozen FA(3) payload is required before KSeF issuance.");
  }

  await assertFrozenFa3Integrity({
    xml: document.fa3_xml,
    sha256: document.fa3_sha256,
    sizeBytes: document.fa3_size_bytes,
  });

  const attemptNumber = await deps.startAttempt(document.id, document.fa3_sha256);

  try {
    const opened = await deps.openSession({
      documentId: document.id,
      legalDocumentNumber: document.legal_document_number,
      sha256: document.fa3_sha256,
      attemptNumber,
    });
    if (!opened.sessionReference.trim()) throw new Error("KSeF session reference is missing.");

    const sessionRecorded = await deps.recordReferences({
      documentId: document.id,
      expectedSha256: document.fa3_sha256,
      sessionReference: opened.sessionReference,
      invoiceReference: null,
      statusCode: null,
    });
    if (!sessionRecorded) {
      throw new Error("KSeF session reference could not be persisted; invoice was not submitted.");
    }

    const submitted = await deps.submitFrozenFa3({
      documentId: document.id,
      legalDocumentNumber: document.legal_document_number,
      xml: document.fa3_xml,
      sha256: document.fa3_sha256,
      sizeBytes: document.fa3_size_bytes,
      attemptNumber,
      sessionReference: opened.sessionReference,
      sessionHandle: opened.sessionHandle,
    });
    if (!submitted.invoiceReference.trim()) throw new Error("KSeF invoice reference is missing.");

    const invoiceRecorded = await deps.recordReferences({
      documentId: document.id,
      expectedSha256: document.fa3_sha256,
      sessionReference: opened.sessionReference,
      invoiceReference: submitted.invoiceReference,
      statusCode: null,
    });
    if (!invoiceRecorded) {
      throw new Error("KSeF invoice reference could not be persisted; reconciliation is required.");
    }

    await deps.closeSession({
      documentId: document.id,
      sessionReference: opened.sessionReference,
      sessionHandle: opened.sessionHandle,
    });

    const acceptance = await deps.waitForAcceptance({
      documentId: document.id,
      expectedSha256: document.fa3_sha256,
      sessionReference: opened.sessionReference,
      invoiceReference: submitted.invoiceReference,
      sessionHandle: opened.sessionHandle,
    });

    const upoSha256 = await sha256Utf8(acceptance.upoXml);
    const accepted = await deps.recordAcceptance({
      documentId: document.id,
      expectedSha256: document.fa3_sha256,
      ksefReferenceNumber: acceptance.ksefReferenceNumber,
      statusCode: acceptance.statusCode,
      upoXml: acceptance.upoXml,
      upoSha256,
      acceptedAt: acceptance.acceptedAt,
    });
    if (!accepted) throw new Error("KSeF acceptance could not be persisted; reconciliation is required.");

    return {
      ...acceptance,
      sessionReference: opened.sessionReference,
      invoiceReference: submitted.invoiceReference,
      upoSha256,
      attemptNumber,
      legalDocumentNumber: document.legal_document_number,
      fa3Sha256: document.fa3_sha256,
    };
  } catch (error) {
    const message = safeError(error);
    try {
      await deps.recordReconciliationError({
        documentId: document.id,
        expectedSha256: document.fa3_sha256,
        error: message,
        statusCode: null,
      });
    } catch {
      // Keep the original failure primary. Never turn an ambiguous post-send
      // failure into a retryable failed state merely because logging failed.
    }
    throw error;
  }
}
