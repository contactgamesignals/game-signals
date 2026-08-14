import { COMPANY } from "@/lib/company";

/**
 * Single source for the seller used by billing/accounting integrations.
 *
 * The legal operator decision is intentionally isolated here so a reviewed
 * pre-LIVE switch of seller does not require changes across Stripe, VAT and
 * KSeF code. Public legal pages continue to use lib/company.ts independently.
 */
export const ACTIVE_SELLER = {
  legalName: COMPANY.legalName,
  nip: COMPANY.nip,
  krs: COMPANY.krs,
  regon: COMPANY.regon,
  countryCode: "PL",
  registeredAddress: COMPANY.registeredAddress,
  structuredAddress: {
    countryCode: "PL",
    line1: "ul. Ujastek 1, 31-752 Kraków",
  },
  productName: COMPANY.productName,
  supportEmail: COMPANY.supportEmail,
  vatStatus: "exempt",
  vatExemptionGoal: "remain_exempt",
  automaticStripeTax: false,
  vatUeStatus: "verify_before_first_qualifying_eu_b2b_service",
  crossBorderSmeStatus: "not_configured",
} as const;
