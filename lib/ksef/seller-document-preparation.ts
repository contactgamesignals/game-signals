import "server-only";

import {
  buildFa3FromSellerDocumentSnapshot,
  type SellerDocumentFa3Snapshot,
} from "@/lib/ksef/seller-document-fa3";

export const SELLER_DOCUMENT_FA3_GENERATOR_VERSION = "gamesignal-fa3-active-vat-2026-08-14-v1";

export type FrozenFa3Preparation = {
  xml: string;
  sha256: string;
  sizeBytes: number;
  generatedAt: string;
  generatorVersion: typeof SELLER_DOCUMENT_FA3_GENERATOR_VERSION;
  invoiceNumber: string;
  netAmountMinor: number;
  vatAmountMinor: number;
  grossAmountMinor: number;
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireGeneratedAt(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error("generatedAt must be an ISO UTC timestamp ending in Z.");
  }
  if (!Number.isFinite(Date.parse(value))) throw new Error("generatedAt is not a valid timestamp.");
  return value;
}

export async function prepareFrozenSellerDocumentFa3(
  snapshot: SellerDocumentFa3Snapshot,
  generatedAt = new Date().toISOString(),
): Promise<FrozenFa3Preparation> {
  const frozenGeneratedAt = requireGeneratedAt(generatedAt);
  const draft = buildFa3FromSellerDocumentSnapshot(snapshot, { generatedAt: frozenGeneratedAt });
  const encoded = new TextEncoder().encode(draft.xml);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));

  return {
    xml: draft.xml,
    sha256: bytesToHex(digest),
    sizeBytes: encoded.byteLength,
    generatedAt: frozenGeneratedAt,
    generatorVersion: SELLER_DOCUMENT_FA3_GENERATOR_VERSION,
    invoiceNumber: draft.invoiceNumber,
    netAmountMinor: draft.netAmountMinor,
    vatAmountMinor: draft.vatAmountMinor,
    grossAmountMinor: draft.grossAmountMinor,
  };
}

export async function assertFrozenFa3Integrity(input: {
  xml: string;
  sha256: string;
  sizeBytes: number;
}) {
  const encoded = new TextEncoder().encode(input.xml);
  if (encoded.byteLength !== input.sizeBytes) {
    throw new Error("Frozen FA(3) size does not match the stored byte length.");
  }
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoded));
  const actual = bytesToHex(digest);
  if (actual !== input.sha256.toLowerCase()) {
    throw new Error("Frozen FA(3) SHA-256 does not match the stored payload.");
  }
  return true;
}
