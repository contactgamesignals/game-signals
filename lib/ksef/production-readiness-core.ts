export const KSEF_EVIDENCE_MAX_AGE_DAYS = 7;

export type KsefReadinessCheck = {
  ok: boolean;
  code: string;
  detail: string;
};

export type KsefProductionReadinessInput = {
  nowMs: number;
  seller: {
    legalName: string;
    nip: string;
    countryCode: string;
    vatStatus: string;
    vatStatusVerifiedAt?: string;
    vatUeStatus: string;
    vatUeVerifiedAt?: string;
  };
  config: {
    environment: "test" | "demo" | "production";
    enabled: boolean;
    productionUnlocked: boolean;
    apiFamily: string;
    invoiceSchema: string;
  };
  finalSellerNip?: string;
  finalSellerConfirmedAt?: string;
  systemTokenConfigured: boolean;
  invoiceWriteVerifiedAt?: string;
};

function normalizedNip(value: string | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function validPolishNip(value: string) {
  const nip = normalizedNip(value);
  if (!/^\d{10}$/.test(nip)) return false;
  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(nip[index]), 0) % 11;
  return checksum !== 10 && checksum === Number(nip[9]);
}

function freshDate(value: string | undefined, nowMs: number) {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed) || parsed > nowMs) return false;
  return nowMs - parsed <= KSEF_EVIDENCE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function check(ok: boolean, code: string, detail: string): KsefReadinessCheck {
  return { ok, code, detail };
}

export function evaluateKsefProductionReadiness(input: KsefProductionReadinessInput) {
  const productionEnvironmentSelected = input.config.environment === "production";
  const productionUnlockPresent = productionEnvironmentSelected && input.config.productionUnlocked;

  const prerequisiteChecks: KsefReadinessCheck[] = [
    check(
      productionEnvironmentSelected,
      "environment_is_production",
      "KSEF_ENV must be production for the final production deployment.",
    ),
    check(
      input.seller.countryCode === "PL" && validPolishNip(input.seller.nip),
      "seller_identity_is_valid_polish_nip",
      "The active seller must have a valid Polish NIP before KSeF production authentication.",
    ),
    check(
      normalizedNip(input.finalSellerNip) === normalizedNip(input.seller.nip),
      "final_seller_nip_matches_active_seller",
      "KSEF_FINAL_SELLER_NIP must explicitly match the reviewed active seller.",
    ),
    check(
      freshDate(input.finalSellerConfirmedAt, input.nowMs),
      "final_seller_confirmation_is_fresh",
      `KSEF_FINAL_SELLER_CONFIRMED_AT must record a final seller confirmation from the last ${KSEF_EVIDENCE_MAX_AGE_DAYS} days.`,
    ),
    check(
      input.seller.vatStatus === "active" && freshDate(input.seller.vatStatusVerifiedAt, input.nowMs),
      "seller_vat_status_is_active_and_fresh",
      `The seller's active Polish VAT status must be re-verified within ${KSEF_EVIDENCE_MAX_AGE_DAYS} days of cutover.`,
    ),
    check(
      input.seller.vatUeStatus === "valid" && freshDate(input.seller.vatUeVerifiedAt, input.nowMs),
      "seller_vat_ue_status_is_valid_and_fresh",
      `The seller's VAT-UE status must be re-verified within ${KSEF_EVIDENCE_MAX_AGE_DAYS} days of cutover.`,
    ),
    check(
      input.systemTokenConfigured,
      "ksef_system_token_is_configured",
      "KSEF_SYSTEM_TOKEN must be configured as a server-only production secret.",
    ),
    check(
      freshDate(input.invoiceWriteVerifiedAt, input.nowMs),
      "invoice_write_permission_is_freshly_verified",
      `InvoiceWrite permission for the final seller/token must be verified within ${KSEF_EVIDENCE_MAX_AGE_DAYS} days of cutover.`,
    ),
  ];

  const armingChecks: KsefReadinessCheck[] = [
    check(
      productionEnvironmentSelected && input.config.enabled,
      "ksef_production_submission_enabled",
      "KSEF_ENABLED must remain false until the separately authorized go-live step.",
    ),
    check(
      productionUnlockPresent,
      "ksef_production_unlock_present",
      "KSEF_PRODUCTION_UNLOCK must remain absent until the separately authorized go-live step.",
    ),
  ];

  const prerequisitesReady = prerequisiteChecks.every((item) => item.ok);
  const submissionArmed = prerequisitesReady
    && productionEnvironmentSelected
    && input.config.enabled
    && productionUnlockPresent
    && input.systemTokenConfigured;

  return {
    mode: "read_only_no_network" as const,
    seller: input.seller,
    ksef: {
      environment: input.config.environment,
      enabled: input.config.enabled,
      productionEnvironmentSelected,
      productionUnlockPresent,
      systemTokenConfigured: input.systemTokenConfigured,
      apiFamily: input.config.apiFamily,
      invoiceSchema: input.config.invoiceSchema,
    },
    prerequisitesReady,
    submissionArmed,
    productionStillLocked: !submissionArmed,
    prerequisiteChecks,
    armingChecks,
    blockers: prerequisiteChecks.filter((item) => !item.ok).map((item) => item.code),
  } as const;
}
