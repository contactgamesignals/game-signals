import "server-only";

export const LEGAL_VERSIONS = {
  terms: "2026-08-15-v3",
  privacy: "2026-08-15-v3",
  withdrawal: "2026-08-15-v1",
} as const;

export const LEGAL_UPDATED_DATE = "15 August 2026";

export function getLegalSupportPhone() {
  const value = process.env.GAMESIGNAL_SUPPORT_PHONE?.trim();
  return value || null;
}

export function legalSupportPhoneConfigured() {
  return getLegalSupportPhone() !== null;
}
