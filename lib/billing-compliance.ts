export type BillingBuyerType = "individual" | "company" | "unknown";
export type BillingJurisdiction = "pl" | "eu" | "non_eu" | "unknown";

export const SELLER_TAX_PROFILE = {
  seller: "Lumino Games sp. z o.o.",
  country: "PL",
  vatStatus: "exempt",
  vatExemptionGoal: "remain_exempt",
  automaticStripeTax: false,
  vatUeStatus: "verify_before_first_qualifying_eu_b2b_service",
  crossBorderSmeStatus: "not_configured",
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
 * This function deliberately does not calculate a VAT rate, decide that an
 * EU customer is a taxable person, or replace accounting/legal review. Stripe
 * automatic tax stays off while Lumino Games operates as a Polish VAT-exempt
 * seller and the cross-border SME/VAT-UE setup is not yet finalized.
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
      smeAction: "verify_if_relevant",
      ksefAction: "scope_review_required",
      liveReadiness: "manual_review",
      accountingReviewRequired: true,
    };
  }

  if (jurisdiction === "pl" && buyerType === "individual") {
    return {
      buyerType,
      jurisdiction,
      taxRoute: "pl_b2c_vat_exempt",
      vatAction: "domestic_vat_exemption_expected_no_vat_charge",
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
      taxRoute: "pl_b2b_vat_exempt",
      vatAction: "domestic_vat_exemption_expected_no_vat_charge",
      vatUeAction: "not_applicable",
      smeAction: "not_applicable",
      ksefAction: "2026_monthly_10000_pln_transition_threshold_review_if_invoice_required",
      liveReadiness: "ready_after_document_flow",
      accountingReviewRequired: true,
    };
  }

  if (jurisdiction === "eu" && buyerType === "company") {
    return {
      buyerType,
      jurisdiction,
      taxRoute: "eu_b2b_reverse_charge_candidate",
      vatAction: "verify_b2b_place_of_supply_and_customer_taxable_person_status",
      vatUeAction: "verify_or_register_vat_ue_before_first_qualifying_service_and_report_vat_ue",
      smeAction: "not_primary_route_for_b2b_reverse_charge_candidate",
      ksefAction: "cross_border_invoice_scope_review",
      liveReadiness: "blocked_tax_setup",
      accountingReviewRequired: true,
    };
  }

  if (jurisdiction === "eu" && buyerType === "individual") {
    return {
      buyerType,
      jurisdiction,
      taxRoute: "eu_b2c_sme_or_oss_review",
      vatAction: "confirm_electronic_service_place_of_supply_before_live",
      vatUeAction: "not_the_primary_b2c_registration_route",
      smeAction: "configure_cross_border_sme_exemption_ex_number_or_choose_destination_vat_oss",
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
      vatAction: "verify_place_of_supply_and_destination_rules",
      vatUeAction: "not_applicable",
      smeAction: "eu_sme_not_applicable",
      ksefAction: "cross_border_invoice_scope_review",
      liveReadiness: "blocked_tax_setup",
      accountingReviewRequired: true,
    };
  }

  return {
    buyerType,
    jurisdiction,
    taxRoute: "non_eu_b2c_local_tax_review",
    vatAction: "verify_destination_country_indirect_tax_rules",
    vatUeAction: "not_applicable",
    smeAction: "eu_sme_not_applicable",
    ksefAction: "not_mandatory_for_b2c",
    liveReadiness: "blocked_tax_setup",
    accountingReviewRequired: true,
  };
}
