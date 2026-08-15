import "server-only";

import { ACTIVE_SELLER } from "@/lib/seller-profile";
import { assertKsefSubmissionAllowed } from "@/lib/ksef/server";
import {
  authenticateWithKsefToken,
  refreshKsefAccessToken,
  type KsefAuthenticationTokens,
} from "@/lib/ksef/token-auth-core";

const ACCESS_TOKEN_SAFETY_WINDOW_MS = 60_000;
const REFRESH_TOKEN_SAFETY_WINDOW_MS = 60_000;

let cachedTokens: KsefAuthenticationTokens | null = null;

function requiredSecret(value: string | undefined, field: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${field} is not configured.`);
  return normalized;
}

function validUntilMs(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("KSeF token validUntil is invalid.");
  return parsed;
}

function tokenStillUsable(validUntil: string, safetyWindowMs: number) {
  return validUntilMs(validUntil) > Date.now() + safetyWindowMs;
}

/**
 * Returns a short-lived KSeF access token for server-side invoice operations.
 *
 * The long-lived KSeF system token is read exclusively from an environment
 * secret. Access/refresh tokens are kept only in process memory and are never
 * written to the billing database, logs, metadata or user-visible responses.
 */
export async function getKsefAccessTokenForSeller() {
  const config = assertKsefSubmissionAllowed();

  if (cachedTokens && tokenStillUsable(cachedTokens.accessToken.validUntil, ACCESS_TOKEN_SAFETY_WINDOW_MS)) {
    return cachedTokens.accessToken.token;
  }

  if (cachedTokens && tokenStillUsable(cachedTokens.refreshToken.validUntil, REFRESH_TOKEN_SAFETY_WINDOW_MS)) {
    try {
      const refreshed = await refreshKsefAccessToken({
        baseUrl: config.baseUrl,
        refreshToken: cachedTokens.refreshToken.token,
      });
      cachedTokens = {
        ...cachedTokens,
        accessToken: refreshed.accessToken,
      };
      return cachedTokens.accessToken.token;
    } catch {
      // A refresh failure is safe to recover from by starting a fresh
      // authentication flow with the long-lived KSeF system token.
      cachedTokens = null;
    }
  }

  const ksefSystemToken = requiredSecret(process.env.KSEF_SYSTEM_TOKEN, "KSEF_SYSTEM_TOKEN");
  cachedTokens = await authenticateWithKsefToken({
    baseUrl: config.baseUrl,
    contextNip: ACTIVE_SELLER.nip,
    ksefToken: ksefSystemToken,
  });
  return cachedTokens.accessToken.token;
}

/** Test/support hook. Never exposes the cached token values. */
export function clearKsefAccessTokenCache() {
  cachedTokens = null;
}
