import "server-only";

import {
  buildFa3StandardVatPolishB2bInvoice,
  type Fa3ActiveVatPostalAddress,
  type Fa3StandardVatDraft,
} from "@/lib/ksef/fa3-active-vat";

export type SellerDocumentFa3Snapshot = {
  source_livemode: boolean;
  lifecycle_status: string;
  legal_document_number: string | null;
  stripe_invoice_id: string;
  seller_nip: string;
  seller_name: string;
  seller_address: string;
  buyer_type: string;
  buyer_name: string | null;
  buyer_country: string | null;
  buyer_address: unknown;
  buyer_tax_ids: unknown;
  currency: string;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
  issue_date: string | null;
  service_period_start: string | null;
  service_period_end: string | null;
};

type BuildOptions = {
  generatedAt?: string;
  previewNumber?: string;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireSafeMinor(value: number, field: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${field} must be a non-negative safe integer.`);
  return value;
}

function findPolishTaxId(value: unknown) {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    const item = objectValue(entry);
    if (!item) continue;
    const type = text(item.type);
    if (type !== "pl_nip" && type !== "eu_vat") continue;
    const normalized = (text(item.value) ?? "").replace(/\D/g, "");
    if (/^\d{10}$/.test(normalized)) return normalized;
  }
  return null;
}

function buyerPostalAddress(value: unknown): Fa3ActiveVatPostalAddress | null {
  const address = objectValue(value);
  if (!address) return null;
  const countryCode = (text(address.country) ?? "PL").toUpperCase();
  const line1 = text(address.line1);
  const postalCode = text(address.postal_code);
  const city = text(address.city);
  const line2 = text(address.line2);
  const primary = [line1, postalCode, city].filter(Boolean).join(", ");
  if (!primary) return null;
  return { countryCode, line1: primary, line2 };
}

function defaultPreviewNumber(snapshot: SellerDocumentFa3Snapshot) {
  const issueDate = snapshot.issue_date ?? "0000-00-00";
  const suffix = snapshot.stripe_invoice_id.replace(/[^A-Za-z0-9_-]/g, "").slice(-24) || "SANDBOX";
  return `PREVIEW/${issueDate.replaceAll("-", "")}/${suffix}`;
}

export function buildFa3FromSellerDocumentSnapshot(
  snapshot: SellerDocumentFa3Snapshot,
  options: BuildOptions = {},
): Fa3StandardVatDraft {
  if (snapshot.buyer_type !== "company") throw new Error("Seller-document FA(3) currently supports Company buyers only.");
  if ((snapshot.buyer_country ?? "").toUpperCase() !== "PL") throw new Error("Seller-document FA(3) currently supports Polish buyers only.");
  if (snapshot.currency.toLowerCase() !== "pln") throw new Error("Seller-document FA(3) currently supports PLN only.");
  if (!snapshot.issue_date) throw new Error("Seller document issue_date is required.");

  const gross = requireSafeMinor(snapshot.gross_amount, "gross_amount");
  const net = requireSafeMinor(snapshot.net_amount, "net_amount");
  const tax = requireSafeMinor(snapshot.tax_amount, "tax_amount");
  if (gross <= 0 || tax <= 0 || gross !== net + tax) {
    throw new Error("Seller-document net/VAT/gross evidence is inconsistent.");
  }

  const buyerName = text(snapshot.buyer_name);
  if (!buyerName) throw new Error("Buyer legal name is required for the PL Company FA(3) route.");
  const buyerNip = findPolishTaxId(snapshot.buyer_tax_ids);
  if (!buyerNip) throw new Error("A Polish buyer NIP is required for the PL Company FA(3) route.");

  let invoiceNumber: string;
  if (snapshot.source_livemode) {
    if (snapshot.lifecycle_status !== "ready_for_issue") {
      throw new Error("LIVE seller document must be ready_for_issue before FA(3) preparation.");
    }
    invoiceNumber = text(snapshot.legal_document_number) ?? "";
    if (!invoiceNumber) throw new Error("LIVE seller document must have a reserved legal document number.");
  } else {
    if (snapshot.lifecycle_status !== "sandbox_preview_ready") {
      throw new Error("Sandbox seller document must be sandbox_preview_ready for preview generation.");
    }
    if (snapshot.legal_document_number) {
      throw new Error("Sandbox seller document must never contain a legal document number.");
    }
    invoiceNumber = options.previewNumber ?? defaultPreviewNumber(snapshot);
  }

  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const servicePeriod = snapshot.service_period_start && snapshot.service_period_end
    ? { from: snapshot.service_period_start, to: snapshot.service_period_end }
    : null;

  const draft = buildFa3StandardVatPolishB2bInvoice({
    invoiceNumber,
    issueDate: snapshot.issue_date,
    createdAt: generatedAt,
    seller: {
      nip: snapshot.seller_nip,
      name: snapshot.seller_name,
      address: {
        countryCode: "PL",
        line1: snapshot.seller_address,
      },
    },
    buyer: {
      nip: buyerNip,
      name: buyerName,
      address: buyerPostalAddress(snapshot.buyer_address),
    },
    serviceName: "GameSignal subscription",
    grossAmountMinor: gross,
    currency: "PLN",
    servicePeriod,
    stripeInvoiceId: snapshot.stripe_invoice_id,
  });

  if (draft.grossAmountMinor !== gross || draft.netAmountMinor !== net || draft.vatAmountMinor !== tax) {
    throw new Error("FA(3) amounts do not match the immutable seller-document snapshot.");
  }

  return draft;
}
