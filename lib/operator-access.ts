import "server-only";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuredOperatorIds() {
  return new Set(
    (process.env.GAMESIGNAL_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value)),
  );
}

/**
 * Explicit operator allowlist for global seller/accounting administration.
 * Empty or malformed configuration fails closed. Customer workspace roles are
 * deliberately not sufficient for access to global launch-readiness state.
 */
export function isGameSignalOperator(userId: string | null | undefined) {
  const normalized = userId?.trim().toLowerCase() ?? "";
  if (!UUID_PATTERN.test(normalized)) return false;
  return configuredOperatorIds().has(normalized);
}
