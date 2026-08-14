import { COMPANY } from "@/lib/company";

/**
 * Single source for the seller used by billing/accounting integrations.
 *
 * The legal operator decision is intentionally isolated here so a reviewed
 * pre-LIVE switch of seller does not require changes across Stripe, VAT and
 * KSeF code. Public legal pages continue to use lib/company.ts independently.
 *
 * VAT status was re-verified against the official Polish VAT register and VIES
 * on 2026-08-14. Re-check immediately before the final LIVE cutover.
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
    line1: "Kazimierza Morawskiego 5/127, 30-102 Kraków",
  },
  productName: COMPANY.productName,
  supportEmail: COMPANY.supportEmail,
  vatStatus: "active",
  vatStatusVerifiedAt: "2026-08-14",
  vatUeStatus: "valid",
  vatUeVerifiedAt: "2026-08-14",
  automaticStripeTax: true,
  stripeTaxPriceBehavior: "inclusive",
  stripeTaxCode: "txcd_10103001",
  euB2cRoute: "blocked_until_threshold_or_oss_review",
  nonEuRoute: "blocked_until_country_tax_review",
} as const;
