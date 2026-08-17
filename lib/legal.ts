import "server-only";
import { COMPANY } from "@/lib/company";

export { LEGAL_UPDATED_DATE, LEGAL_VERSIONS } from "@/lib/legal-versions";

export function getLegalSupportPhone() {
  const override = process.env.GAMESIGNAL_SUPPORT_PHONE?.trim();
  return override || COMPANY.supportPhone;
}

export function legalSupportPhoneConfigured() {
  return getLegalSupportPhone().length > 0;
}
