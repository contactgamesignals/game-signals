import assert from "node:assert/strict";
import { issueFrozenSellerDocumentToKsef } from "@/lib/ksef/issuance-orchestrator";

const xml = "<Faktura>orchestrator regression</Faktura>";
const bytes = new TextEncoder().encode(xml);
const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
const sha256 = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");

const document = {
  id: "00000000-0000-0000-0000-000000000001",
  source_livemode: true,
  lifecycle_status: "ready_for_issue",
  legal_document_number: "GS/2026/000001",
  fa3_xml: xml,
  fa3_sha256: sha256,
  fa3_size_bytes: bytes.byteLength,
  ksef_reference_number: null,
};

let attempt = 0;
let reconcileErrors = 0;
let accepted = 0;
let refs = 0;
let submittedXml: string | null = null;
let submittedHash: string | null = null;

const success = await issueFrozenSellerDocumentToKsef(document, {
  async startAttempt(_documentId, expectedHash) {
    assert.equal(expectedHash, sha256);
    attempt += 1;
    return attempt;
  },
  async submitFrozenFa3(input) {
    submittedXml = input.xml;
    submittedHash = input.sha256;
    assert.equal(input.legalDocumentNumber, "GS/2026/000001");
    return {
      sessionReference: "SESSION-1",
      invoiceReference: "INVOICE-1",
      ksefReferenceNumber: "KSEF-1",
      statusCode: 200,
      upoXml: "<UPO>accepted</UPO>",
      acceptedAt: "2026-08-14T22:00:00Z",
    };
  },
  async recordReferences() {
    refs += 1;
    return true;
  },
  async recordReconciliationError() {
    reconcileErrors += 1;
    return true;
  },
  async recordAcceptance(input) {
    assert.match(input.upoSha256, /^[0-9a-f]{64}$/);
    accepted += 1;
    return true;
  },
});

assert.equal(success.attemptNumber, 1);
assert.equal(submittedXml, xml);
assert.equal(submittedHash, sha256);
assert.equal(refs, 1);
assert.equal(accepted, 1);
assert.equal(reconcileErrors, 0);

let ambiguousReconcileErrors = 0;
await assert.rejects(
  () => issueFrozenSellerDocumentToKsef(
    { ...document, lifecycle_status: "failed" },
    {
      async startAttempt() { return 2; },
      async submitFrozenFa3(input) {
        assert.equal(input.xml, xml);
        assert.equal(input.sha256, sha256);
        throw new Error("synthetic ambiguous network timeout after send");
      },
      async recordReferences() { throw new Error("must not run"); },
      async recordReconciliationError(input) {
        assert.match(input.error, /ambiguous network timeout/);
        ambiguousReconcileErrors += 1;
        return true;
      },
      async recordAcceptance() { throw new Error("must not run"); },
    },
  ),
  /ambiguous network timeout/,
);
assert.equal(ambiguousReconcileErrors, 1);

await assert.rejects(
  () => issueFrozenSellerDocumentToKsef({ ...document, lifecycle_status: "ksef_pending" }, {} as never),
  /not ready for a KSeF issuance attempt/,
);

console.log("KSeF issuance orchestrator ambiguity regression passed.");
