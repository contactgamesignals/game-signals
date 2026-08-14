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

export type KsefSubmissionResult = {
  sessionReference: string;
  invoiceReference: string | null;
  ksefReferenceNumber: string;
  statusCode: number;
  upoXml: string;
  acceptedAt: string;
};

export type KsefIssuanceDependencies = {
  startAttempt: (documentId: string, expectedSha256: string) => Promise<number>;
  submitFrozenFa3: (input: {
    documentId: string;
    legalDocumentNumber: string;
    xml: string;
    sha256: string;
    sizeBytes: number;
    attemptNumber: number;
  }) => Promise<KsefSubmissionResult>;
  recordReferences: (input: {
    documentId: string;
    expectedSha256: string;
    sessionReference: string;
    invoiceReference: string | null;
    statusCode: number;
  }) => Promise<boolean>;
  recordFailure: (input: {
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
    const result = await deps.submitFrozenFa3({
      documentId: document.id,
      legalDocumentNumber: document.legal_document_number,
      xml: document.fa3_xml,
      sha256: document.fa3_sha256,
      sizeBytes: document.fa3_size_bytes,
      attemptNumber,
    });

    const refsRecorded = await deps.recordReferences({
      documentId: document.id,
      expectedSha256: document.fa3_sha256,
      sessionReference: result.sessionReference,
      invoiceReference: result.invoiceReference,
      statusCode: result.statusCode,
    });
    if (!refsRecorded) throw new Error("KSeF references could not be persisted for the current attempt.");

    const upoSha256 = await sha256Utf8(result.upoXml);
    const accepted = await deps.recordAcceptance({
      documentId: document.id,
      expectedSha256: document.fa3_sha256,
      ksefReferenceNumber: result.ksefReferenceNumber,
      statusCode: result.statusCode,
      upoXml: result.upoXml,
      upoSha256,
      acceptedAt: result.acceptedAt,
    });
    if (!accepted) throw new Error("KSeF acceptance could not be persisted for the current attempt.");

    return {
      ...result,
      upoSha256,
      attemptNumber,
      legalDocumentNumber: document.legal_document_number,
      fa3Sha256: document.fa3_sha256,
    };
  } catch (error) {
    const message = safeError(error);
    try {
      await deps.recordFailure({
        documentId: document.id,
        expectedSha256: document.fa3_sha256,
        error: message,
        statusCode: null,
      });
    } catch {
      // The original KSeF/persistence error remains primary. A failed failure-log
      // write must not hide it or trigger generation of a replacement document.
    }
    throw error;
  }
}
