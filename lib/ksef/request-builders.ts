export type KsefEncryptionInfo = {
  encryptedSymmetricKey: string;
  initializationVector: string;
  publicKeyId?: string | null;
};

function required(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function nonNegativeInteger(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative safe integer.`);
  return value;
}

export function buildOpenFa3OnlineSessionRequest(encryption: KsefEncryptionInfo) {
  const encryptedSymmetricKey = required(encryption.encryptedSymmetricKey, "encryptedSymmetricKey");
  const initializationVector = required(encryption.initializationVector, "initializationVector");
  const publicKeyId = encryption.publicKeyId ? required(encryption.publicKeyId, "publicKeyId") : null;

  return {
    formCode: {
      systemCode: "FA (3)",
      schemaVersion: "1-0E",
      value: "FA",
    },
    encryption: {
      encryptedSymmetricKey,
      initializationVector,
      ...(publicKeyId ? { publicKeyId } : {}),
    },
  } as const;
}

export function buildSendOnlineInvoiceRequest(input: {
  invoiceHash: string;
  invoiceSize: number;
  encryptedInvoiceHash: string;
  encryptedInvoiceSize: number;
  encryptedInvoiceContent: string;
  hashOfCorrectedInvoice?: string | null;
  offlineMode?: boolean;
}) {
  const invoiceHash = required(input.invoiceHash, "invoiceHash");
  const encryptedInvoiceHash = required(input.encryptedInvoiceHash, "encryptedInvoiceHash");
  const encryptedInvoiceContent = required(input.encryptedInvoiceContent, "encryptedInvoiceContent");

  return {
    invoiceHash,
    invoiceSize: nonNegativeInteger(input.invoiceSize, "invoiceSize"),
    encryptedInvoiceHash,
    encryptedInvoiceSize: nonNegativeInteger(input.encryptedInvoiceSize, "encryptedInvoiceSize"),
    encryptedInvoiceContent,
    ...(input.hashOfCorrectedInvoice
      ? { hashOfCorrectedInvoice: required(input.hashOfCorrectedInvoice, "hashOfCorrectedInvoice") }
      : {}),
    offlineMode: input.offlineMode === true,
  } as const;
}
