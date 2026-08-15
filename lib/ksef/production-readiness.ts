import "server-only";

import { ACTIVE_SELLER } from "@/lib/seller-profile";
import { getKsefServerConfig } from "@/lib/ksef/server";

const EVIDENCE_MAX_AGE_DAYS = 7;

type ReadinessCheck = {
  ok: boolean;
  code: string;
  detail: string;
};

function configured(value: string | undefined) {
  return Boolean(value?.trim());
}

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
  return nowMs - parsed <= EVIDENCE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function check(ok: boolean, code: string, detail: string): ReadinessCheck {
  return { ok, code, detail };
}

/**
 * Read-only KSeF production preflight.
 *
 * This function performs no network requests, never authenticates to KSeF and
 * never exposes secret values. It is intentionally safe to execute while KSeF
 * production issuance remains disabled. The final two arming switches
 * (KSEF_ENABLED + KSEF_PRODUCTION_UNLOCK) are reported separately from
 * prerequisite readiness so production can be fully prepared while still
 * remaining legally inert.
 */
export function getKsefProductionReadiness(nowMs = Date.now()) {
  const config = getKsefServerConfig();
  const finalSellerNip = normalizedNip(process.env.KSEF_FINAL_SELLER_NIP);
  const systemTokenConfigured = configured(process.env.KSEF_SYSTEM_TOKEN);
  const productionEnvironmentSelected = config.environment === "production";
  const productionUnlockPresent = productionEnvironmentSelected && config.productionUnlocked;

  const prerequisiteChecks: ReadinessCheck[] = [
    check(
      productionEnvironmentSelected,
      "environment_is_production",
      "KSEF_ENV must be production for the final production deployment.",
    ),
    check(
      ACTIVE_SELLER.countryCode === "PL" && validPolishNip(ACTIVE_SELLER.nip),
      "seller_identity_is_valid_polish_nip",
      "The active seller must have a valid Polish NIP before KSeF production authentication.",
    ),
    check(
      finalSellerNip === normalizedNip(ACTIVE_SELLER.nip),
      "final_seller_nip_matches_active_seller",
      "KSEF_FINAL_SELLER_NIP must explicitly match the reviewed active seller.",
    ),
    check(
      freshDate(process.env.KSEF_FINAL_SELLER_CONFIRMED_AT, nowMs),
      "final_seller_confirmation_is_fresh",
      `KSEF_FINAL_SELLER_CONFIRMED_AT must record a final seller confirmation from the last ${EVIDENCE_MAX_AGE_DAYS} days.`,
    ),
    check(
      ACTIVE_SELLER.vatStatus === "active" && freshDate(ACTIVE_SELLER.vatStatusVerifiedAt, nowMs),
      "seller_vat_status_is_active_and_fresh",
      `The seller's active Polish VAT status must be re-verified within ${EVIDENCE_MAX_AGE_DAYS} days of cutover.`,
    ),
    check(
      ACTIVE_SELLER.vatUeStatus === "valid" && freshDate(ACTIVE_SELLER.vatUeVerifiedAt, nowMs),
      "seller_vat_ue_status_is_valid_and_fresh",
      `The seller's VAT-UE status must be re-verified within ${EVIDENCE_MAX_AGE_DAYS} days of cutover.`,
    ),
    check(
      systemTokenConfigured,
      "ksef_system_token_is_configured",
      "KSEF_SYSTEM_TOKEN must be configured as a server-only production secret.",
    ),
    check(
      freshDate(process.env.KSEF_INVOICE_WRITE_VERIFIED_AT, nowMs),
      "invoice_write_permission_is_freshly_verified",
      `InvoiceWrite permission for the final seller/token must be verified within ${EVIDENCE_MAX_AGE_DAYS} days of cutover.`,
    ),
  ];

  const armingChecks: ReadinessCheck[] = [
    check(
      productionEnvironmentSelected && config.enabled,
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
    && config.enabled
    && productionUnlockPresent
    && systemTokenConfigured;

  return {
    mode: "read_only_no_network" as const,
    seller: {
      legalName: ACTIVE_SELLER.legalName,
      nip: ACTIVE_SELLER.nip,
      countryCode: ACTIVE_SELLER.countryCode,
      vatStatus: ACTIVE_SELLER.vatStatus,
      vatStatusVerifiedAt: ACTIVE_SELLER.vatStatusVerifiedAt,
      vatUeStatus: ACTIVE_SELLER.vatUeStatus,
      vatUeVerifiedAt: ACTIVE_SELLER.vatUeVerifiedAt,
    },
    ksef: {
      environment: config.environment,
      enabled: config.enabled,
      productionEnvironmentSelected,
      productionUnlockPresent,
      systemTokenConfigured,
      apiFamily: config.apiFamily,
      invoiceSchema: config.invoiceSchema,
    },
    prerequisitesReady,
    submissionArmed,
    productionStillLocked: !submissionArmed,
    prerequisiteChecks,
    armingChecks,
    blockers: prerequisiteChecks.filter((item) => !item.ok).map((item) => item.code),
  } as const;
}
