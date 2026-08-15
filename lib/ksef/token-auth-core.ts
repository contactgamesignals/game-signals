import { constants, publicEncrypt, X509Certificate } from "node:crypto";

export type KsefPublicKeyUsage = "KsefTokenEncryption" | "SymmetricKeyEncryption";

export type KsefPublicKeyCertificate = {
  certificate: string;
  certificateId: string;
  publicKeyId: string;
  validFrom: string;
  validTo: string;
  usage: string[];
};

export type KsefTokenInfo = {
  token: string;
  validUntil: string;
};

export type KsefAuthenticationTokens = {
  accessToken: KsefTokenInfo;
  refreshToken: KsefTokenInfo;
  referenceNumber: string;
};

export type KsefRefreshedAccessToken = {
  accessToken: KsefTokenInfo;
};

export class KsefTokenRedeemAmbiguousError extends Error {
  constructor(message = "KSeF token redeem result is ambiguous; restart the full authentication flow with a fresh challenge.") {
    super(message);
    this.name = "KsefTokenRedeemAmbiguousError";
  }
}

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type SleepLike = (milliseconds: number) => Promise<void>;
type EncryptTokenLike = (input: { plaintext: Buffer; certificateDerBase64: string }) => Buffer;

function requireText(value: unknown, field: string, maxLength = 4096) {
  if (typeof value !== "string") throw new Error(`KSeF ${field} is missing.`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`KSeF ${field} is missing.`);
  if (normalized.length > maxLength) throw new Error(`KSeF ${field} is too long.`);
  return normalized;
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`KSeF ${field} is invalid.`);
  }
  return value as Record<string, unknown>;
}

function requireNip(value: string) {
  const nip = value.replace(/\D/g, "");
  if (!/^\d{10}$/.test(nip)) throw new Error("KSeF context NIP must contain exactly 10 digits.");
  return nip;
}

function parseTimestampMs(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{10,16}$/.test(trimmed)) return Number(trimmed);
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error("KSeF challenge timestamp is invalid.");
}

function parseDate(value: string, field: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`KSeF ${field} is invalid.`);
  return parsed;
}

function parseTokenInfo(value: unknown, field: string): KsefTokenInfo {
  const token = requireObject(value, field);
  const validUntil = requireText(token.validUntil, `${field}.validUntil`, 128);
  if (!Number.isFinite(Date.parse(validUntil))) throw new Error(`KSeF ${field}.validUntil is invalid.`);
  return {
    token: requireText(token.token, `${field}.token`, 16_384),
    validUntil,
  };
}

async function parseJson(response: Response, label: string) {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(`KSeF ${label} returned invalid JSON.`);
  }
}

async function requestJson(input: {
  fetchImpl: FetchLike;
  url: string;
  method: "GET" | "POST";
  bearerToken?: string;
  body?: unknown;
  expectedStatus: number;
  label: string;
  timeoutMs: number;
}) {
  let response: Response;
  try {
    response = await input.fetchImpl(input.url, {
      method: input.method,
      headers: {
        Accept: "application/json",
        ...(input.bearerToken ? { Authorization: `Bearer ${input.bearerToken}` } : {}),
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: "no-store",
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch {
    throw new Error(`KSeF ${input.label} request failed before a response was received.`);
  }

  if (response.status !== input.expectedStatus) {
    throw new Error(`KSeF ${input.label} failed with HTTP ${response.status}.`);
  }
  return parseJson(response, input.label);
}

function normalizeCertificates(value: unknown): KsefPublicKeyCertificate[] {
  if (!Array.isArray(value)) throw new Error("KSeF public-key response is invalid.");
  return value.map((item, index) => {
    const object = requireObject(item, `public certificate ${index}`);
    const usage = Array.isArray(object.usage)
      ? object.usage.filter((entry): entry is string => typeof entry === "string")
      : [];
    return {
      certificate: requireText(object.certificate, `public certificate ${index}.certificate`, 65_536),
      certificateId: requireText(object.certificateId, `public certificate ${index}.certificateId`, 512),
      publicKeyId: requireText(object.publicKeyId, `public certificate ${index}.publicKeyId`, 512),
      validFrom: requireText(object.validFrom, `public certificate ${index}.validFrom`, 128),
      validTo: requireText(object.validTo, `public certificate ${index}.validTo`, 128),
      usage,
    };
  });
}

export function selectKsefPublicKeyCertificate(
  certificates: KsefPublicKeyCertificate[],
  usage: KsefPublicKeyUsage,
  nowMs = Date.now(),
) {
  const selected = certificates
    .filter((certificate) => certificate.usage.includes(usage))
    .map((certificate) => ({
      certificate,
      validFromMs: parseDate(certificate.validFrom, "certificate.validFrom"),
      validToMs: parseDate(certificate.validTo, "certificate.validTo"),
    }))
    .filter((candidate) => candidate.validFromMs <= nowMs && candidate.validToMs >= nowMs)
    .sort((a, b) => b.validFromMs - a.validFromMs)[0]?.certificate;

  if (!selected) throw new Error(`KSeF returned no currently valid ${usage} certificate.`);
  return selected;
}

export function encryptKsefTokenWithCertificate(input: {
  ksefToken: string;
  timestampMs: number;
  certificateDerBase64: string;
}) {
  const token = requireText(input.ksefToken, "system token", 4096);
  if (!Number.isSafeInteger(input.timestampMs) || input.timestampMs <= 0) {
    throw new Error("KSeF challenge timestamp must be a positive integer number of milliseconds.");
  }
  const certificateBytes = Buffer.from(requireText(input.certificateDerBase64, "token encryption certificate", 65_536), "base64");
  if (!certificateBytes.length) throw new Error("KSeF token encryption certificate is empty.");
  const certificate = new X509Certificate(certificateBytes);
  const plaintext = Buffer.from(`${token}|${input.timestampMs}`, "utf8");
  return publicEncrypt({
    key: certificate.publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, plaintext);
}

export async function authenticateWithKsefToken(input: {
  baseUrl: string;
  contextNip: string;
  ksefToken: string;
  fetchImpl?: FetchLike;
  sleepImpl?: SleepLike;
  encryptTokenImpl?: EncryptTokenLike;
  nowMs?: () => number;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}): Promise<KsefAuthenticationTokens> {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const contextNip = requireNip(input.contextNip);
  const ksefToken = requireText(input.ksefToken, "system token", 4096);
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleepImpl = input.sleepImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const encryptTokenImpl = input.encryptTokenImpl ?? ((payload) => {
    const certificateBytes = Buffer.from(payload.certificateDerBase64, "base64");
    if (!certificateBytes.length) throw new Error("KSeF token encryption certificate is empty.");
    const certificate = new X509Certificate(certificateBytes);
    return publicEncrypt({
      key: certificate.publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    }, payload.plaintext);
  });
  const nowMs = input.nowMs ?? Date.now;
  const requestTimeoutMs = input.requestTimeoutMs ?? 15_000;
  const pollIntervalMs = input.pollIntervalMs ?? 1_000;
  const pollTimeoutMs = input.pollTimeoutMs ?? 120_000;

  const challengePayload = requireObject(await requestJson({
    fetchImpl,
    url: `${baseUrl}/auth/challenge`,
    method: "POST",
    expectedStatus: 200,
    label: "auth challenge",
    timeoutMs: requestTimeoutMs,
  }), "challenge response");
  const challenge = requireText(challengePayload.challenge, "challenge", 1024);
  const timestampMs = parseTimestampMs(challengePayload.timestamp);

  const certificatesPayload = await requestJson({
    fetchImpl,
    url: `${baseUrl}/security/public-key-certificates`,
    method: "GET",
    expectedStatus: 200,
    label: "public-key certificates",
    timeoutMs: requestTimeoutMs,
  });
  const certificate = selectKsefPublicKeyCertificate(
    normalizeCertificates(certificatesPayload),
    "KsefTokenEncryption",
    nowMs(),
  );

  const plaintext = Buffer.from(`${ksefToken}|${timestampMs}`, "utf8");
  const encryptedToken = encryptTokenImpl({
    plaintext,
    certificateDerBase64: certificate.certificate,
  }).toString("base64");

  const initPayload = requireObject(await requestJson({
    fetchImpl,
    url: `${baseUrl}/auth/ksef-token`,
    method: "POST",
    body: {
      challenge,
      contextIdentifier: { type: "Nip", value: contextNip },
      encryptedToken,
      publicKeyId: certificate.publicKeyId,
    },
    expectedStatus: 202,
    label: "KSeF-token authentication start",
    timeoutMs: requestTimeoutMs,
  }), "authentication start response");

  const referenceNumber = requireText(initPayload.referenceNumber, "authentication referenceNumber", 512);
  const authenticationToken = parseTokenInfo(initPayload.authenticationToken, "authenticationToken").token;

  const pollStartedAt = nowMs();
  while (true) {
    const statusPayload = requireObject(await requestJson({
      fetchImpl,
      url: `${baseUrl}/auth/${encodeURIComponent(referenceNumber)}`,
      method: "GET",
      bearerToken: authenticationToken,
      expectedStatus: 200,
      label: "authentication status",
      timeoutMs: requestTimeoutMs,
    }), "authentication status response");
    const status = requireObject(statusPayload.status, "authentication status");
    const code = status.code;
    if (typeof code !== "number" || !Number.isInteger(code)) throw new Error("KSeF authentication status code is invalid.");
    if (code === 200) break;
    if (code >= 400) throw new Error(`KSeF authentication ended with status code ${code}.`);
    if (nowMs() - pollStartedAt >= pollTimeoutMs) throw new Error("KSeF authentication polling timed out.");
    await sleepImpl(pollIntervalMs);
  }

  let redeemedPayload: unknown;
  try {
    redeemedPayload = await requestJson({
      fetchImpl,
      url: `${baseUrl}/auth/token/redeem`,
      method: "POST",
      bearerToken: authenticationToken,
      expectedStatus: 200,
      label: "authentication token redeem",
      timeoutMs: requestTimeoutMs,
    });
  } catch {
    // Redeem is one-shot. We deliberately do not retry the same temporary
    // authentication token after a transport/HTTP ambiguity. A caller may
    // safely restart the whole KSeF-token auth flow with a fresh challenge.
    throw new KsefTokenRedeemAmbiguousError();
  }

  const redeemed = requireObject(redeemedPayload, "redeem response");
  return {
    accessToken: parseTokenInfo(redeemed.accessToken, "accessToken"),
    refreshToken: parseTokenInfo(redeemed.refreshToken, "refreshToken"),
    referenceNumber,
  };
}

export async function refreshKsefAccessToken(input: {
  baseUrl: string;
  refreshToken: string;
  fetchImpl?: FetchLike;
  requestTimeoutMs?: number;
}): Promise<KsefRefreshedAccessToken> {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const refreshToken = requireText(input.refreshToken, "refresh token", 16_384);
  const fetchImpl = input.fetchImpl ?? fetch;
  const requestTimeoutMs = input.requestTimeoutMs ?? 15_000;

  const payload = requireObject(await requestJson({
    fetchImpl,
    url: `${baseUrl}/auth/token/refresh`,
    method: "POST",
    bearerToken: refreshToken,
    expectedStatus: 200,
    label: "access-token refresh",
    timeoutMs: requestTimeoutMs,
  }), "refresh response");

  return { accessToken: parseTokenInfo(payload.accessToken, "accessToken") };
}
