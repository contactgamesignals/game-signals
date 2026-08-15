import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { KsefIssuanceDependencies } from "@/lib/ksef/issuance-orchestrator";

function requiredText(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required.`);
  return normalized;
}

function safeErrorText(value: string) {
  const normalized = value.trim();
  return (normalized || "Unknown KSeF error.").slice(0, 4000);
}

type UntypedRpcResponse = {
  data: unknown;
  error: { message: string } | null;
};

async function rpc<T>(name: string, params: Record<string, unknown>): Promise<T> {
  const supabase = getSupabaseAdminClient();
  // The admin client is intentionally schema-untyped. Supabase therefore
  // infers RPC args as `undefined` even though these service-role-only
  // functions take named arguments. Keep this escape hatch local to the RPC
  // boundary instead of weakening types throughout the billing/KSeF code.
  const callRpc = supabase.rpc as unknown as (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<UntypedRpcResponse>;
  const { data, error } = await callRpc(name, params);
  if (error) throw new Error(`Supabase ${name} failed: ${error.message}`);
  return data as T;
}

function requireBoolean(value: unknown, operation: string) {
  if (value !== true) throw new Error(`${operation} did not update exactly one seller document.`);
  return true;
}

export function createSellerDocumentKsefStateAdapter(): Pick<
  KsefIssuanceDependencies,
  "startAttempt" | "recordReferences" | "recordReconciliationError" | "recordAcceptance"
> {
  return {
    async startAttempt(documentId, expectedSha256) {
      const attempt = await rpc<unknown>("start_seller_document_ksef_attempt", {
        p_document_id: requiredText(documentId, "documentId"),
        p_expected_fa3_sha256: requiredText(expectedSha256, "expectedSha256").toLowerCase(),
      });
      if (typeof attempt !== "number" || !Number.isSafeInteger(attempt) || attempt <= 0) {
        throw new Error("Supabase returned an invalid KSeF attempt number.");
      }
      return attempt;
    },

    async recordReferences(input) {
      const updated = await rpc<unknown>("record_seller_document_ksef_references", {
        p_document_id: requiredText(input.documentId, "documentId"),
        p_expected_fa3_sha256: requiredText(input.expectedSha256, "expectedSha256").toLowerCase(),
        p_session_reference: requiredText(input.sessionReference, "sessionReference"),
        p_invoice_reference: input.invoiceReference?.trim() || null,
        p_status_code: input.statusCode,
      });
      return requireBoolean(updated, "KSeF reference persistence");
    },

    async recordReconciliationError(input) {
      const updated = await rpc<unknown>("record_seller_document_ksef_reconciliation_error", {
        p_document_id: requiredText(input.documentId, "documentId"),
        p_expected_fa3_sha256: requiredText(input.expectedSha256, "expectedSha256").toLowerCase(),
        p_error: safeErrorText(input.error),
        p_status_code: input.statusCode,
      });
      return requireBoolean(updated, "KSeF reconciliation error persistence");
    },

    async recordAcceptance(input) {
      const updated = await rpc<unknown>("accept_seller_document_ksef", {
        p_document_id: requiredText(input.documentId, "documentId"),
        p_expected_fa3_sha256: requiredText(input.expectedSha256, "expectedSha256").toLowerCase(),
        p_ksef_reference_number: requiredText(input.ksefReferenceNumber, "ksefReferenceNumber"),
        p_status_code: input.statusCode,
        p_upo_xml: requiredText(input.upoXml, "upoXml"),
        p_upo_sha256: requiredText(input.upoSha256, "upoSha256").toLowerCase(),
        p_accepted_at: requiredText(input.acceptedAt, "acceptedAt"),
      });
      return requireBoolean(updated, "KSeF acceptance persistence");
    },
  };
}

/**
 * This is intentionally separate from the generic issuance adapter. Call it
 * only after KSeF has returned an authoritative rejection that proves a retry
 * cannot duplicate an already accepted legal invoice.
 */
export async function recordAuthoritativeKsefRejection(input: {
  documentId: string;
  expectedSha256: string;
  statusCode: number;
  error: string;
}) {
  if (!Number.isInteger(input.statusCode) || input.statusCode < 400) {
    throw new Error("An authoritative KSeF rejection requires a final 4xx/5xx status code.");
  }
  const updated = await rpc<unknown>("fail_seller_document_ksef_attempt", {
    p_document_id: requiredText(input.documentId, "documentId"),
    p_expected_fa3_sha256: requiredText(input.expectedSha256, "expectedSha256").toLowerCase(),
    p_error: safeErrorText(input.error),
    p_status_code: input.statusCode,
  });
  return requireBoolean(updated, "KSeF authoritative rejection persistence");
}
