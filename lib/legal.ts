import "server-only";

export { LEGAL_UPDATED_DATE, LEGAL_VERSIONS } from "@/lib/legal-versions";

export function getLegalSupportPhone() {
  const value = process.env.GAMESIGNAL_SUPPORT_PHONE?.trim();
  return value || null;
}

export function legalSupportPhoneConfigured() {
  return getLegalSupportPhone() !== null;
}
