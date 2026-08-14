export type LocationEvidenceConsistency = "match" | "mismatch" | "insufficient";

function country(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : null;
}

/**
 * Compare two independent country-level billing signals.
 *
 * This is evidence classification only. A match does not decide VAT treatment,
 * and a mismatch does not accuse the customer of providing incorrect data.
 * Mismatches require another location signal/accounting review before any
 * automated cross-border tax conclusion is made.
 */
export function classifyLocationEvidence(input: {
  billingCountry: unknown;
  paymentMethodCountry: unknown;
}): {
  billingCountry: string | null;
  paymentMethodCountry: string | null;
  consistency: LocationEvidenceConsistency;
} {
  const billingCountry = country(input.billingCountry);
  const paymentMethodCountry = country(input.paymentMethodCountry);

  if (!billingCountry || !paymentMethodCountry) {
    return { billingCountry, paymentMethodCountry, consistency: "insufficient" };
  }

  return {
    billingCountry,
    paymentMethodCountry,
    consistency: billingCountry === paymentMethodCountry ? "match" : "mismatch",
  };
}
