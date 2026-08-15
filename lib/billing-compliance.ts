import { ACTIVE_SELLER } from "@/lib/seller-profile";

export type BillingBuyerType = "individual" | "company" | "unknown";
export type BillingJurisdiction = "pl" | "eu" | "non_eu" | "unknown";

export const SELLER_TAX_PROFILE = {
  seller: ACTIVE_SELLER.legalName,
  country: ACTIVE_SELLER.countryCode,
  vatStatus: ACTIVE_SELLER.vatStatus,
  automaticStripeTax: ACTIVE_SELLER.automaticStripeTax,
  vatUeStatus: ACTIVE_SELLER.vatUeStatus,
  vatStatusVerifiedAt: ACTIVE_SELLER.vatStatusVerifiedAt,
  vatUeVerifiedAt: ACTIVE_SELLER.vatUeVerifiedAt,
  stripeTaxPriceBehavior: ACTIVE_SELLER.stripeTaxPriceBehavior,
  stripeTaxCode: ACTIVE_SELLER.stripeTaxCode,
  euB2cRoute: ACTIVE_SELLER.euB2cRoute,
  nonEuRoute: ACTIVE_SELLER.nonEuRoute,
} as const;

export type BillingComplianceRoute = {
  buyerType: BillingBuyerType;
  jurisdiction: BillingJurisdiction;
  taxRoute: string;
  vatAction: string;
  vatUeAction: string;
  smeAction: string;
  ksefAction: string;
  liveReadiness: "ready_after_document_flow" | "blocked_tax_setup" | "manual_review";
  accountingReviewRequired: boolean;
};

function normalizeBuyerType(value: unknown): BillingBuyerType {
  return value === "individual" || value === "company" ? value : "unknown";
}

function normalizeJurisdiction(value: unknown): BillingJurisdiction {
  return value === "pl" || value === "eu" || value === "non_eu" ? value : "unknown";
}

/**
 * Classifies billing records for accounting/compliance routing only.
 *
 * Lumino Games was verified as an active Polish VAT taxpayer and valid VAT-UE
 * taxpayer on 2026-08-14. This function deliberately does not replace final
 * transaction evidence checks: EU B2B still requires customer VAT-ID/VIES
 * evidence, and EU/non-EU B2C stays fail-closed until the launch tax route is
 * explicitly approved.
 *
 * For PL Company launch we deliberately do not auto-use the temporary 2026
 * KSeF <=10,000 PLN monthly transition. That threshold depends on seller-wide
 * invoice activity, including activity outside GameSignal, and therefore cannot
 * be safely inferred by this application. PL Company LIVE remains blocked until
 * the production KSeF path is explicitly prepared and authorized.
 */
export function deriveBillingCompliance(input: {
  buyerType: unknown;
  jurisdictionBucket: unknown;
}): BillingComplianceRoute {
  const buyerType = normalizeBuyerType(input.buyerType);
  const jurisdiction = normalizeJurisdiction(input.jurisdictionBucket);

  if (buyerType === "unknown" || jurisdiction === "unknown") {
    return {
      buyerType,
      jurisdiction,
      taxRoute: "unknown_manual_review",
      vatAction: "verify_customer_and_transaction",
      vatUeAction: "verify_if_relevant",
      smeAction: "not_used_active_vat_seller",
      ksefAction: "scope_review_required",
      liveReadiness: "manual_review",
      accountingReviewRequired: true,
    };
  }

  if (jurisdiction === "pl" && buyerType === "individual") {
    return {
      buyerType,
      jurisdiction,
      taxRoute: "pl_b2c_standard_vat",
      vatAction: "charge_polish_vat_using_inclusive_price",
      vatUeAction: "not_applicable",
      smeAction: "not_applicable",
      ksefAction: "not_mandatory_for_b2c",
      liveReadiness: "ready_after_document_flow",
      accountingReviewRequired: false,
    };
  }

  if (jurisdiction === "pl" && buyerType === "company") {
    return {
      buyerType,
      jurisdiction,
      taxRoute: "pl_b2b_standard_vat",
      vatAction: "charge_polish_vat_using_inclusive_price",
      vatUeAction: "not_applicable",
      smeAction: "not_applicable",
      ksefAction: "require_ksef_prod_before_live_do_not_auto_use_2026_10k_transition",
      liveReadiness: "blocked_tax_setup",
      accountingReviewRequired: true,
    };
  }

  if (jurisdiction === "eu" && buyerType === "company") {
    return {
      buyerType,
      jurisdiction,
      taxRoute: "eu_b2b_reverse_charge_candidate",
      vatAction: "use_stripe_tax_only_after_valid_business_tax_id_and_place_of_supply_evidence",
      vatUeAction: "seller_vat_ue_valid_verify_customer_vat_id_in_vies_and_report_if_required",
      smeAction: "not_applicable_to_standard_b2b_route",
      ksefAction: "issue_cross_border_business_invoice_under_current_polish_ksef_rules",
      liveReadiness: "ready_after_document_flow",
      accountingReviewRequired: true,
    };
  }

  if (jurisdiction === "eu" && buyerType === "individual") {
    return {
      buyerType,
      jurisdiction,
      taxRoute: "eu_b2c_destination_vat_or_threshold_review",
      vatAction: "blocked_until_eur_10000_threshold_and_oss_destination_vat_route_is_confirmed",
      vatUeAction: "not_primary_b2c_route",
      smeAction: "not_used_for_current_active_vat_launch_profile",
      ksefAction: "not_mandatory_for_b2c",
      liveReadiness: "blocked_tax_setup",
      accountingReviewRequired: true,
    };
  }

  if (jurisdiction === "non_eu" && buyerType === "company") {
    return {
      buyerType,
      jurisdiction,
      taxRoute: "non_eu_b2b_local_tax_review",
      vatAction: "verify_place_of_supply_and_destination_rules_before_live",
      vatUeAction: "not_applicable",
      smeAction: "not_applicable",
      ksefAction: "cross_border_business_invoice_scope_review",
      liveReadiness: "blocked_tax_setup",
      accountingReviewRequired: true,
    };
  }

  return {
    buyerType,
    jurisdiction,
    taxRoute: "non_eu_b2c_local_tax_review",
    vatAction: "blocked_until_destination_country_indirect_tax_rules_are_approved",
    vatUeAction: "not_applicable",
    smeAction: "not_applicable",
    ksefAction: "not_mandatory_for_b2c",
    liveReadiness: "blocked_tax_setup",
    accountingReviewRequired: true,
  };
}
