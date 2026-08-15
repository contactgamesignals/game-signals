import "server-only";

import { evaluateKsefProductionReadiness } from "@/lib/ksef/production-readiness-core";
import { ACTIVE_SELLER } from "@/lib/seller-profile";
import { getKsefServerConfig } from "@/lib/ksef/server";

function configured(value: string | undefined) {
  return Boolean(value?.trim());
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

  return evaluateKsefProductionReadiness({
    nowMs,
    seller: {
      legalName: ACTIVE_SELLER.legalName,
      nip: ACTIVE_SELLER.nip,
      countryCode: ACTIVE_SELLER.countryCode,
      vatStatus: ACTIVE_SELLER.vatStatus,
      vatStatusVerifiedAt: ACTIVE_SELLER.vatStatusVerifiedAt,
      vatUeStatus: ACTIVE_SELLER.vatUeStatus,
      vatUeVerifiedAt: ACTIVE_SELLER.vatUeVerifiedAt,
    },
    config: {
      environment: config.environment,
      enabled: config.enabled,
      productionUnlocked: config.productionUnlocked,
      apiFamily: config.apiFamily,
      invoiceSchema: config.invoiceSchema,
    },
    finalSellerNip: process.env.KSEF_FINAL_SELLER_NIP,
    finalSellerConfirmedAt: process.env.KSEF_FINAL_SELLER_CONFIRMED_AT,
    systemTokenConfigured: configured(process.env.KSEF_SYSTEM_TOKEN),
    invoiceWriteVerifiedAt: process.env.KSEF_INVOICE_WRITE_VERIFIED_AT,
  });
}
