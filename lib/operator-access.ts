import "server-only";

import { isOperatorUserIdAllowed } from "@/lib/operator-access-core";

/**
 * Explicit operator allowlist for global seller/accounting administration.
 * Empty or malformed configuration fails closed. Customer workspace roles are
 * deliberately not sufficient for access to global launch-readiness state.
 */
export function isGameSignalOperator(userId: string | null | undefined) {
  return isOperatorUserIdAllowed(userId, process.env.GAMESIGNAL_OPERATOR_USER_IDS);
}
