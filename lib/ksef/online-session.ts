import "server-only";

import { assertKsefSubmissionAllowed } from "@/lib/ksef/server";
import {
  buildOpenFa3OnlineSessionRequest,
  buildSendOnlineInvoiceRequest,
  type KsefEncryptionInfo,
} from "@/lib/ksef/request-builders";

function required(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

async function ksefRequest<T>(input: {
  method: "GET" | "POST";
  path: string;
  accessToken: string;
  body?: unknown;
  responseType?: "json" | "text";
  extraHeaders?: Record<string, string>;
}): Promise<T> {
  const config = assertKsefSubmissionAllowed();
  const accessToken = required(input.accessToken, "KSeF accessToken");
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${input.path}`, {
      method: input.method,
      headers: {
        Accept: input.responseType === "text" ? "application/xml, text/xml, */*" : "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...(input.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...input.extraHeaders,
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new Error(`KSeF ${input.method} ${input.path} failed before a response was received.`);
  }

  if (!response.ok) {
    // Do not copy KSeF response bodies into exceptions. They may contain
    // invoice/business data and exceptions can later reach centralized logs.
    throw new Error(`KSeF ${input.method} ${input.path} failed with HTTP ${response.status}.`);
  }

  if (input.responseType === "text") return await response.text() as T;
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new Error(`KSeF ${input.method} ${input.path} returned invalid JSON.`);
  }
}

export type OpenOnlineSessionResponse = {
  referenceNumber: string;
  validUntil: string;
};

export type SendOnlineInvoiceResponse = {
  referenceNumber: string;
};

export type SessionInvoicesPageResponse = {
  continuationToken?: string | null;
  invoices?: unknown[] | null;
};

export function openFa3OnlineSession(input: {
  accessToken: string;
  encryption: KsefEncryptionInfo;
}) {
  return ksefRequest<OpenOnlineSessionResponse>({
    method: "POST",
    path: "/sessions/online",
    accessToken: input.accessToken,
    body: buildOpenFa3OnlineSessionRequest(input.encryption),
  });
}

export function sendFa3OnlineInvoice(input: {
  accessToken: string;
  sessionReferenceNumber: string;
  invoiceHash: string;
  invoiceSize: number;
  encryptedInvoiceHash: string;
  encryptedInvoiceSize: number;
  encryptedInvoiceContent: string;
  hashOfCorrectedInvoice?: string | null;
  offlineMode?: boolean;
}) {
  const referenceNumber = encodeURIComponent(required(input.sessionReferenceNumber, "sessionReferenceNumber"));
  return ksefRequest<SendOnlineInvoiceResponse>({
    method: "POST",
    path: `/sessions/online/${referenceNumber}/invoices`,
    accessToken: input.accessToken,
    body: buildSendOnlineInvoiceRequest(input),
  });
}

export function getKsefSessionStatus(input: {
  accessToken: string;
  sessionReferenceNumber: string;
}) {
  const referenceNumber = encodeURIComponent(required(input.sessionReferenceNumber, "sessionReferenceNumber"));
  return ksefRequest<Record<string, unknown>>({
    method: "GET",
    path: `/sessions/${referenceNumber}`,
    accessToken: input.accessToken,
  });
}

export function getKsefSessionInvoicesPage(input: {
  accessToken: string;
  sessionReferenceNumber: string;
  continuationToken?: string | null;
  pageSize?: number;
}) {
  const referenceNumber = encodeURIComponent(required(input.sessionReferenceNumber, "sessionReferenceNumber"));
  const pageSize = input.pageSize ?? 100;
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0 || pageSize > 1000) {
    throw new Error("KSeF session invoice pageSize is invalid.");
  }
  const continuationToken = input.continuationToken?.trim() || null;
  return ksefRequest<SessionInvoicesPageResponse>({
    method: "GET",
    path: `/sessions/${referenceNumber}/invoices?pageSize=${pageSize}`,
    accessToken: input.accessToken,
    extraHeaders: continuationToken ? { "x-continuation-token": continuationToken } : undefined,
  });
}

export function getKsefSessionInvoiceStatus(input: {
  accessToken: string;
  sessionReferenceNumber: string;
  invoiceReferenceNumber: string;
}) {
  const sessionReference = encodeURIComponent(required(input.sessionReferenceNumber, "sessionReferenceNumber"));
  const invoiceReference = encodeURIComponent(required(input.invoiceReferenceNumber, "invoiceReferenceNumber"));
  return ksefRequest<Record<string, unknown>>({
    method: "GET",
    path: `/sessions/${sessionReference}/invoices/${invoiceReference}`,
    accessToken: input.accessToken,
  });
}

export function getKsefInvoiceUpo(input: {
  accessToken: string;
  sessionReferenceNumber: string;
  invoiceReferenceNumber: string;
}) {
  const sessionReference = encodeURIComponent(required(input.sessionReferenceNumber, "sessionReferenceNumber"));
  const invoiceReference = encodeURIComponent(required(input.invoiceReferenceNumber, "invoiceReferenceNumber"));
  return ksefRequest<string>({
    method: "GET",
    path: `/sessions/${sessionReference}/invoices/${invoiceReference}/upo`,
    accessToken: input.accessToken,
    responseType: "text",
  });
}

export async function closeKsefOnlineSession(input: {
  accessToken: string;
  sessionReferenceNumber: string;
}) {
  const referenceNumber = encodeURIComponent(required(input.sessionReferenceNumber, "sessionReferenceNumber"));
  await ksefRequest<void>({
    method: "POST",
    path: `/sessions/online/${referenceNumber}/close`,
    accessToken: input.accessToken,
  });
}
