import assert from "node:assert/strict";

import {
  KsefTokenRedeemAmbiguousError,
  authenticateWithKsefToken,
  refreshKsefAccessToken,
  selectKsefPublicKeyCertificate,
  type KsefPublicKeyCertificate,
} from "../lib/ksef/token-auth-core.ts";

const fixedNow = Date.parse("2026-08-15T01:00:00Z");
const systemToken = "KSEF-UNIT-TOKEN-NOT-A-SECRET";
const contextNip = "6762600090";
const challengeTimestamp = "2026-08-15T00:59:50.123Z";
const challengeTimestampMs = Date.parse(challengeTimestamp);

const certificates: KsefPublicKeyCertificate[] = [
  {
    certificate: "ZXhwaXJlZC1jZXJ0",
    certificateId: "expired-cert-id",
    publicKeyId: "expired-key-id",
    validFrom: "2024-01-01T00:00:00Z",
    validTo: "2025-01-01T00:00:00Z",
    usage: ["KsefTokenEncryption"],
  },
  {
    certificate: "b2xkZXItY3VycmVudC1jZXJ0",
    certificateId: "older-current-cert-id",
    publicKeyId: "older-current-key-id",
    validFrom: "2026-01-01T00:00:00Z",
    validTo: "2027-01-01T00:00:00Z",
    usage: ["KsefTokenEncryption"],
  },
  {
    certificate: "bmV3ZXItY3VycmVudC1jZXJ0",
    certificateId: "newer-current-cert-id",
    publicKeyId: "newer-current-key-id",
    validFrom: "2026-07-01T00:00:00Z",
    validTo: "2027-07-01T00:00:00Z",
    usage: ["KsefTokenEncryption"],
  },
  {
    certificate: "c3ltbWV0cmljLWtleS1jZXJ0",
    certificateId: "symmetric-cert-id",
    publicKeyId: "symmetric-key-id",
    validFrom: "2026-07-01T00:00:00Z",
    validTo: "2027-07-01T00:00:00Z",
    usage: ["SymmetricKeyEncryption"],
  },
];

assert.equal(
  selectKsefPublicKeyCertificate(certificates, "KsefTokenEncryption", fixedNow).publicKeyId,
  "newer-current-key-id",
  "Token auth must prefer the newest currently valid KsefTokenEncryption key.",
);
assert.equal(
  selectKsefPublicKeyCertificate(certificates, "SymmetricKeyEncryption", fixedNow).publicKeyId,
  "symmetric-key-id",
);
assert.throws(
  () => selectKsefPublicKeyCertificate(certificates, "KsefTokenEncryption", Date.parse("2030-01-01T00:00:00Z")),
  /no currently valid/i,
);

function jsonResponse(status: number, value: unknown) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const calls: Array<{ url: string; init?: RequestInit }> = [];
let statusPolls = 0;
const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input);
  calls.push({ url, init });

  if (url.endsWith("/auth/challenge")) {
    assert.equal(init?.method, "POST");
    return jsonResponse(200, {
      challenge: "20260815-CR-UNIT-TEST",
      timestamp: challengeTimestamp,
    });
  }

  if (url.endsWith("/security/public-key-certificates")) {
    assert.equal(init?.method, "GET");
    return jsonResponse(200, certificates);
  }

  if (url.endsWith("/auth/ksef-token")) {
    assert.equal(init?.method, "POST");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.deepEqual(body.contextIdentifier, { type: "Nip", value: contextNip });
    assert.equal(body.challenge, "20260815-CR-UNIT-TEST");
    assert.equal(body.publicKeyId, "newer-current-key-id");
    assert.equal(body.encryptedToken, Buffer.from("unit-ciphertext", "utf8").toString("base64"));
    assert.equal("authorizationPolicy" in body, false);
    return jsonResponse(202, {
      referenceNumber: "20260815-AU-UNIT-TEST",
      authenticationToken: {
        token: "temporary-authentication-token",
        validUntil: "2026-08-15T01:10:00Z",
      },
    });
  }

  if (url.endsWith("/auth/20260815-AU-UNIT-TEST")) {
    assert.equal(init?.method, "GET");
    assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer temporary-authentication-token");
    statusPolls += 1;
    return jsonResponse(200, {
      status: statusPolls === 1
        ? { code: 100, description: "Authentication in progress" }
        : { code: 200, description: "Authentication completed successfully" },
    });
  }

  if (url.endsWith("/auth/token/redeem")) {
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer temporary-authentication-token");
    assert.equal(init?.body, undefined);
    return jsonResponse(200, {
      accessToken: {
        token: "short-lived-access-token",
        validUntil: "2026-08-15T01:20:00Z",
      },
      refreshToken: {
        token: "refresh-token-kept-in-memory-only",
        validUntil: "2026-08-16T01:00:00Z",
      },
    });
  }

  throw new Error(`Unexpected test URL: ${url}`);
};

const authenticated = await authenticateWithKsefToken({
  baseUrl: "https://api-test.example/v2/",
  contextNip,
  ksefToken: systemToken,
  fetchImpl,
  sleepImpl: async () => {},
  encryptTokenImpl: ({ plaintext, certificateDerBase64 }) => {
    assert.equal(plaintext.toString("utf8"), `${systemToken}|${challengeTimestampMs}`);
    assert.equal(certificateDerBase64, "bmV3ZXItY3VycmVudC1jZXJ0");
    return Buffer.from("unit-ciphertext", "utf8");
  },
  nowMs: () => fixedNow,
  pollIntervalMs: 1,
  pollTimeoutMs: 10_000,
});

assert.equal(authenticated.referenceNumber, "20260815-AU-UNIT-TEST");
assert.equal(authenticated.accessToken.token, "short-lived-access-token");
assert.equal(authenticated.refreshToken.token, "refresh-token-kept-in-memory-only");
assert.equal(statusPolls, 2);
assert.equal(calls.some((call) => JSON.stringify(call).includes(systemToken)), false, "Raw KSeF system token must never appear in HTTP request metadata/body.");

let refreshCalled = false;
const refreshed = await refreshKsefAccessToken({
  baseUrl: "https://api-test.example/v2",
  refreshToken: "unit-refresh-token",
  fetchImpl: async (input, init) => {
    refreshCalled = true;
    assert.equal(String(input), "https://api-test.example/v2/auth/token/refresh");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer unit-refresh-token");
    assert.equal(init?.body, undefined);
    return jsonResponse(200, {
      accessToken: {
        token: "refreshed-access-token",
        validUntil: "2026-08-15T01:30:00Z",
      },
    });
  },
});
assert.equal(refreshCalled, true);
assert.equal(refreshed.accessToken.token, "refreshed-access-token");

let redeemAttempted = false;
await assert.rejects(
  authenticateWithKsefToken({
    baseUrl: "https://api-test.example/v2",
    contextNip,
    ksefToken: systemToken,
    sleepImpl: async () => {},
    nowMs: () => fixedNow,
    encryptTokenImpl: () => Buffer.from("unit-ciphertext", "utf8"),
    fetchImpl: async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/challenge")) return jsonResponse(200, { challenge: "C", timestamp: challengeTimestamp });
      if (url.endsWith("/security/public-key-certificates")) return jsonResponse(200, certificates);
      if (url.endsWith("/auth/ksef-token")) return jsonResponse(202, {
        referenceNumber: "R",
        authenticationToken: { token: "T", validUntil: "2026-08-15T01:10:00Z" },
      });
      if (url.endsWith("/auth/R")) return jsonResponse(200, { status: { code: 200, description: "OK" } });
      if (url.endsWith("/auth/token/redeem")) {
        redeemAttempted = true;
        assert.equal((init?.headers as Record<string, string>)?.Authorization, "Bearer T");
        throw new Error("Synthetic network loss after potential one-shot redeem");
      }
      throw new Error(`Unexpected ambiguity-test URL: ${url}`);
    },
  }),
  (error: unknown) => error instanceof KsefTokenRedeemAmbiguousError,
);
assert.equal(redeemAttempted, true);

await assert.rejects(
  authenticateWithKsefToken({
    baseUrl: "https://api-test.example/v2",
    contextNip: "123",
    ksefToken: systemToken,
  }),
  /10 digits/,
);

console.log("KSeF token-auth rotation, request-shape, polling, one-shot redeem and refresh regressions passed.");
