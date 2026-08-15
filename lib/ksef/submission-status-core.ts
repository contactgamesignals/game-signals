export type KsefInvoiceProcessingState =
  | { kind: "processing"; statusCode: 100 | 150 }
  | {
      kind: "accepted";
      statusCode: 200;
      ksefNumber: string;
      acquisitionDate: string;
      invoicingDate: string;
    }
  | {
      kind: "duplicate";
      statusCode: 440;
      originalSessionReferenceNumber: string | null;
      originalKsefNumber: string | null;
    }
  | { kind: "rejected"; statusCode: number; description: string | null }
  | { kind: "unknown"; statusCode: number; description: string | null };

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`KSeF ${label} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown, label: string) {
  const result = text(value);
  if (!result) throw new Error(`KSeF ${label} is missing.`);
  return result;
}

function validIsoDate(value: unknown, label: string) {
  const result = requiredText(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`KSeF ${label} is invalid.`);
  return result;
}

export function classifyKsefInvoiceStatus(value: unknown): KsefInvoiceProcessingState {
  const response = object(value, "invoice status response");
  const status = object(response.status, "invoice status");
  const code = status.code;
  if (typeof code !== "number" || !Number.isInteger(code)) {
    throw new Error("KSeF invoice status code is invalid.");
  }
  const description = text(status.description);

  if (code === 100 || code === 150) {
    return { kind: "processing", statusCode: code };
  }

  if (code === 200) {
    return {
      kind: "accepted",
      statusCode: 200,
      ksefNumber: requiredText(response.ksefNumber, "ksefNumber"),
      acquisitionDate: validIsoDate(response.acquisitionDate, "acquisitionDate"),
      invoicingDate: validIsoDate(response.invoicingDate, "invoicingDate"),
    };
  }

  if (code === 440) {
    const extensions = status.extensions && typeof status.extensions === "object" && !Array.isArray(status.extensions)
      ? status.extensions as Record<string, unknown>
      : {};
    return {
      kind: "duplicate",
      statusCode: 440,
      originalSessionReferenceNumber: text(extensions.originalSessionReferenceNumber),
      originalKsefNumber: text(extensions.originalKsefNumber),
    };
  }

  if (code >= 400) {
    return { kind: "rejected", statusCode: code, description };
  }

  return { kind: "unknown", statusCode: code, description };
}
