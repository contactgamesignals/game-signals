import "server-only";

import { getKsefServerConfig } from "@/lib/ksef/server";

type PublicKeyCertificate = {
  certificate?: unknown;
  certificateId?: unknown;
  publicKeyId?: unknown;
  validFrom?: unknown;
  validTo?: unknown;
  usage?: unknown;
};

function requiredText(value: unknown, field: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`KSeF ${field} is missing.`);
  return value.trim();
}

function dateValue(value: unknown, field: string) {
  const text = requiredText(value, field);
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error(`KSeF ${field} is not a valid date.`);
  return { text, timestamp };
}

export async function probeKsefPublicTestApi() {
  const config = getKsefServerConfig();
  if (config.environment === "production") {
    throw new Error("Public KSeF readiness probe is intentionally disabled for production.");
  }

  const [challengeResponse, certificatesResponse] = await Promise.all([
    fetch(`${config.baseUrl}/auth/challenge`, {
      method: "POST",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(`${config.baseUrl}/security/public-key-certificates`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    }),
  ]);

  if (!challengeResponse.ok) throw new Error(`KSeF challenge probe failed with HTTP ${challengeResponse.status}.`);
  if (!certificatesResponse.ok) throw new Error(`KSeF public-key probe failed with HTTP ${certificatesResponse.status}.`);

  const challengePayload = await challengeResponse.json() as Record<string, unknown>;
  const certificatesPayload = await certificatesResponse.json() as PublicKeyCertificate[];

  const challenge = requiredText(challengePayload.challenge, "challenge");
  const challengeTimestamp = requiredText(challengePayload.timestamp, "challenge timestamp");
  if (!Array.isArray(certificatesPayload) || certificatesPayload.length === 0) {
    throw new Error("KSeF returned no public-key certificates.");
  }

  const now = Date.now();
  const symmetricCandidates = certificatesPayload
    .map((item) => {
      const usage = Array.isArray(item.usage) ? item.usage.filter((value): value is string => typeof value === "string") : [];
      if (!usage.includes("SymmetricKeyEncryption")) return null;

      const validFrom = dateValue(item.validFrom, "certificate validFrom");
      const validTo = dateValue(item.validTo, "certificate validTo");
      return {
        publicKeyId: requiredText(item.publicKeyId, "publicKeyId"),
        certificateId: requiredText(item.certificateId, "certificateId"),
        certificatePresent: typeof item.certificate === "string" && item.certificate.length > 100,
        validFrom,
        validTo,
        currentlyValid: validFrom.timestamp <= now && validTo.timestamp >= now,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((a, b) => b.validFrom.timestamp - a.validFrom.timestamp);

  const selected = symmetricCandidates.find((item) => item.currentlyValid && item.certificatePresent);
  if (!selected) throw new Error("KSeF returned no currently valid SymmetricKeyEncryption certificate.");

  return {
    environment: config.environment,
    apiFamily: config.apiFamily,
    challengeReceived: challenge.length > 0,
    challengeTimestamp,
    symmetricKeyCandidates: symmetricCandidates.length,
    selectedPublicKeyId: selected.publicKeyId,
    selectedCertificateId: selected.certificateId,
    selectedValidFrom: selected.validFrom.text,
    selectedValidTo: selected.validTo.text,
    productionSubmissionEnabled: false,
  } as const;
}
