import "server-only";

import {
  buildKsefEncryptedInvoicePayload,
  encryptKsefSessionKeyWithCertificate,
  generateKsefSessionIv,
  generateKsefSessionKey,
} from "@/lib/ksef/crypto-core";
import {
  closeKsefOnlineSession,
  getKsefInvoiceUpo,
  getKsefSessionInvoiceStatus,
  openFa3OnlineSession,
  sendFa3OnlineInvoice,
} from "@/lib/ksef/online-session";
import { assertKsefSubmissionAllowed } from "@/lib/ksef/server";
import { classifyKsefInvoiceStatus } from "@/lib/ksef/submission-status-core";
import { getKsefAccessTokenForSeller } from "@/lib/ksef/token-auth";
import {
  parseKsefPublicKeyCertificates,
  selectKsefPublicKeyCertificate,
} from "@/lib/ksef/token-auth-core";
import type { KsefIssuanceDependencies } from "@/lib/ksef/issuance-orchestrator";

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 15_000;

export class KsefDuplicateInvoiceRequiresReconciliationError extends Error {
  readonly originalSessionReferenceNumber: string | null;
  readonly originalKsefNumber: string | null;

  constructor(input: { originalSessionReferenceNumber: string | null; originalKsefNumber: string | null }) {
    super("KSeF reported a duplicate invoice. Reconcile the original KSeF submission before any retry.");
    this.name = "KsefDuplicateInvoiceRequiresReconciliationError";
    this.originalSessionReferenceNumber = input.originalSessionReferenceNumber;
    this.originalKsefNumber = input.originalKsefNumber;
  }
}

export class KsefInvoiceRejectedError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`KSeF rejected the invoice with status code ${statusCode}.`);
    this.name = "KsefInvoiceRejectedError";
    this.statusCode = statusCode;
  }
}

export class KsefUnknownInvoiceStatusError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number) {
    super(`KSeF returned unrecognized invoice status code ${statusCode}; reconciliation is required.`);
    this.name = "KsefUnknownInvoiceStatusError";
    this.statusCode = statusCode;
  }
}

type OnlineSessionHandle = {
  accessToken: string;
  key: Buffer;
  iv: Buffer;
  keyCleared: boolean;
};

function requireHandle(value: unknown): OnlineSessionHandle {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("KSeF in-memory session handle is missing.");
  }
  const handle = value as Partial<OnlineSessionHandle>;
  if (typeof handle.accessToken !== "string" || !handle.accessToken) {
    throw new Error("KSeF in-memory session access token is missing.");
  }
  if (!Buffer.isBuffer(handle.key) || !Buffer.isBuffer(handle.iv)) {
    throw new Error("KSeF in-memory session encryption material is missing.");
  }
  return handle as OnlineSessionHandle;
}

function clearHandleEncryption(handle: OnlineSessionHandle) {
  if (handle.keyCleared) return;
  handle.key.fill(0);
  handle.iv.fill(0);
  handle.keyCleared = true;
}

async function fetchCurrentSymmetricEncryptionCertificate() {
  const config = assertKsefSubmissionAllowed();
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/security/public-key-certificates`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("KSeF public-key certificate request failed before a response was received.");
  }
  if (!response.ok) {
    throw new Error(`KSeF public-key certificate request failed with HTTP ${response.status}.`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("KSeF public-key certificate response is not valid JSON.");
  }
  return selectKsefPublicKeyCertificate(
    parseKsefPublicKeyCertificates(payload),
    "SymmetricKeyEncryption",
  );
}

async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Network-only KSeF transport for the issuance orchestrator.
 *
 * This module is intentionally inert: importing it does not open a KSeF
 * session or read the long-lived KSeF system token. Calls remain protected by
 * assertKsefSubmissionAllowed() and the token provider's environment secret.
 */
export function createKsefOnlineIssuanceTransport(input?: {
  pollIntervalMs?: number;
  pollTimeoutMs?: number;
}): Pick<
  KsefIssuanceDependencies,
  "openSession" | "submitFrozenFa3" | "closeSession" | "waitForAcceptance"
> {
  const pollIntervalMs = input?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const pollTimeoutMs = input?.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  return {
    async openSession() {
      assertKsefSubmissionAllowed();
      const accessToken = await getKsefAccessTokenForSeller();
      const certificate = await fetchCurrentSymmetricEncryptionCertificate();
      const key = generateKsefSessionKey();
      const iv = generateKsefSessionIv();
      const encryptedKey = encryptKsefSessionKeyWithCertificate({
        sessionKey: key,
        certificateDerBase64: certificate.certificate,
      });

      const opened = await openFa3OnlineSession({
        accessToken,
        encryption: {
          encryptedSymmetricKey: encryptedKey.toString("base64"),
          initializationVector: iv.toString("base64"),
          publicKeyId: certificate.publicKeyId,
        },
      });

      if (!opened.referenceNumber?.trim()) {
        key.fill(0);
        iv.fill(0);
        throw new Error("KSeF open-session response did not contain a reference number.");
      }

      return {
        sessionReference: opened.referenceNumber,
        sessionHandle: {
          accessToken,
          key,
          iv,
          keyCleared: false,
        } satisfies OnlineSessionHandle,
      };
    },

    async submitFrozenFa3(input) {
      const handle = requireHandle(input.sessionHandle);
      if (handle.keyCleared) throw new Error("KSeF session encryption material was already cleared.");
      const payload = buildKsefEncryptedInvoicePayload({
        invoiceXml: input.xml,
        key: handle.key,
        iv: handle.iv,
      });
      const sent = await sendFa3OnlineInvoice({
        accessToken: handle.accessToken,
        sessionReferenceNumber: input.sessionReference,
        ...payload,
        offlineMode: false,
      });
      if (!sent.referenceNumber?.trim()) throw new Error("KSeF invoice-send response did not contain a reference number.");
      return { invoiceReference: sent.referenceNumber };
    },

    async closeSession(input) {
      const handle = requireHandle(input.sessionHandle);
      try {
        await closeKsefOnlineSession({
          accessToken: handle.accessToken,
          sessionReferenceNumber: input.sessionReference,
        });
      } finally {
        // AES material is no longer needed after invoice submission. Wipe it
        // even if close is ambiguous; reconciliation uses persisted references.
        clearHandleEncryption(handle);
      }
    },

    async waitForAcceptance(input) {
      const handle = requireHandle(input.sessionHandle);
      const startedAt = Date.now();

      while (true) {
        const rawStatus = await getKsefSessionInvoiceStatus({
          accessToken: handle.accessToken,
          sessionReferenceNumber: input.sessionReference,
          invoiceReferenceNumber: input.invoiceReference,
        });
        const status = classifyKsefInvoiceStatus(rawStatus);

        if (status.kind === "accepted") {
          const upoXml = await getKsefInvoiceUpo({
            accessToken: handle.accessToken,
            sessionReferenceNumber: input.sessionReference,
            invoiceReferenceNumber: input.invoiceReference,
          });
          if (!upoXml.trim()) throw new Error("KSeF returned an empty UPO document.");
          return {
            ksefReferenceNumber: status.ksefNumber,
            statusCode: status.statusCode,
            upoXml,
            acceptedAt: status.acquisitionDate,
          };
        }

        if (status.kind === "duplicate") {
          throw new KsefDuplicateInvoiceRequiresReconciliationError(status);
        }
        if (status.kind === "rejected") {
          throw new KsefInvoiceRejectedError(status.statusCode);
        }
        if (status.kind === "unknown") {
          throw new KsefUnknownInvoiceStatusError(status.statusCode);
        }

        if (Date.now() - startedAt >= pollTimeoutMs) {
          throw new Error("KSeF invoice status polling timed out; reconciliation is required.");
        }
        await sleep(pollIntervalMs);
      }
    },
  };
}
