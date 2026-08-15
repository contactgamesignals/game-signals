import "server-only";

import type { BillingBuyerType, BillingJurisdiction } from "@/lib/billing-compliance";

export type KsefDeliveryRoute = {
  invoiceChannel: "voluntary_b2c" | "ksef_if_seller_obligation_applies" | "manual_review";
  buyerDelivery: "ksef_native" | "outside_ksef_with_required_marking" | "consumer_agreed_method" | "manual_review";
  note: string;
};

/**
 * KSeF routing only. This does not decide whether the seller is currently
 * inside the temporary 2026 <= PLN 10,000 monthly invoiced-sales relief.
 * That threshold must be evaluated from the seller's full monthly invoiced
 * sales before a legal invoice is issued.
 */
export function deriveKsefDeliveryRoute(input: {
  buyerType: BillingBuyerType;
  jurisdiction: BillingJurisdiction;
}): KsefDeliveryRoute {
  if (input.buyerType === "unknown" || input.jurisdiction === "unknown") {
    return {
      invoiceChannel: "manual_review",
      buyerDelivery: "manual_review",
      note: "Buyer type or jurisdiction is unknown; do not automate KSeF issuance or delivery.",
    };
  }

  if (input.buyerType === "individual") {
    return {
      invoiceChannel: "voluntary_b2c",
      buyerDelivery: "consumer_agreed_method",
      note: "Consumer invoices are outside mandatory KSeF; if issued in KSeF voluntarily, deliver them to the consumer in the agreed manner with the required access/QR information.",
    };
  }

  if (input.jurisdiction === "pl") {
    return {
      invoiceChannel: "ksef_if_seller_obligation_applies",
      buyerDelivery: "ksef_native",
      note: "For a Polish business buyer with NIP, use KSeF when the seller's KSeF issuance obligation applies; the buyer receives the structured invoice through KSeF.",
    };
  }

  return {
    invoiceChannel: "ksef_if_seller_obligation_applies",
    buyerDelivery: "outside_ksef_with_required_marking",
    note: "A Polish seller can still have a KSeF issuance obligation for an invoice to a foreign business. The foreign buyer does not receive it natively in KSeF; provide the invoice outside KSeF in the agreed manner with the required KSeF/QR marking after issuance.",
  };
}
