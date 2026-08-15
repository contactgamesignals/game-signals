const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isOperatorUserIdAllowed(
  userId: string | null | undefined,
  configuredUserIds: string | null | undefined,
) {
  const normalized = userId?.trim().toLowerCase() ?? "";
  if (!UUID_PATTERN.test(normalized)) return false;

  const allowed = new Set(
    (configuredUserIds ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => UUID_PATTERN.test(value)),
  );

  return allowed.has(normalized);
}
