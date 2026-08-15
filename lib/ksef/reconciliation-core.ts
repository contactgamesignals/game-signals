export type KsefSessionInvoiceCandidate = {
  invoiceNumber: string | null;
  referenceNumber: string | null;
  invoiceHash: string | null;
};

export type KsefInvoiceReferenceRecovery =
  | { kind: "matched"; referenceNumber: string }
  | { kind: "not_found" }
  | { kind: "ambiguous"; matchingReferenceNumbers: string[] };

function normalizeText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hexSha256ToBase64(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Frozen FA(3) SHA-256 must be a 64-character hex digest.");
  }
  return Buffer.from(normalized, "hex").toString("base64");
}

export function parseKsefSessionInvoiceCandidate(value: unknown): KsefSessionInvoiceCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("KSeF session invoice entry is invalid.");
  }
  const entry = value as Record<string, unknown>;
  return {
    invoiceNumber: normalizeText(entry.invoiceNumber),
    referenceNumber: normalizeText(entry.referenceNumber),
    invoiceHash: normalizeText(entry.invoiceHash),
  };
}

/**
 * Recover an invoice reference only when KSeF returns exactly one invoice whose
 * seller invoice number AND SHA-256 of the exact frozen FA(3) bytes both match.
 * A weak/partial match is intentionally ignored.
 */
export function matchFrozenSellerDocumentInKsefSession(input: {
  legalDocumentNumber: string;
  frozenFa3Sha256Hex: string;
  invoices: unknown[];
}): KsefInvoiceReferenceRecovery {
  const legalDocumentNumber = input.legalDocumentNumber.trim();
  if (!legalDocumentNumber) throw new Error("Legal document number is required for KSeF reconciliation.");
  const expectedHashBase64 = hexSha256ToBase64(input.frozenFa3Sha256Hex);

  const matches = input.invoices
    .map(parseKsefSessionInvoiceCandidate)
    .filter((candidate) =>
      candidate.invoiceNumber === legalDocumentNumber
      && candidate.invoiceHash === expectedHashBase64
      && candidate.referenceNumber,
    )
    .map((candidate) => candidate.referenceNumber as string);

  const unique = [...new Set(matches)];
  if (unique.length === 0) return { kind: "not_found" };
  if (unique.length === 1) return { kind: "matched", referenceNumber: unique[0] };
  return { kind: "ambiguous", matchingReferenceNumbers: unique };
}
