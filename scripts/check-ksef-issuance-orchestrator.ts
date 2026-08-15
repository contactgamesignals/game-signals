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

const order: string[] = [];
let attempt = 0;
let accepted = 0;
let reconcileErrors = 0;

const success = await issueFrozenSellerDocumentToKsef(document, {
  async startAttempt(_documentId, expectedHash) {
    assert.equal(expectedHash, sha256);
    order.push("start");
    attempt += 1;
    return attempt;
  },
  async openSession(input) {
    assert.equal(input.legalDocumentNumber, "GS/2026/000001");
    assert.equal(input.sha256, sha256);
    order.push("open");
    return { sessionReference: "SESSION-1", sessionHandle: { opaque: true } };
  },
  async recordReferences(input) {
    if (input.invoiceReference === null) {
      assert.equal(input.sessionReference, "SESSION-1");
      order.push("record-session");
    } else {
      assert.equal(input.sessionReference, "SESSION-1");
      assert.equal(input.invoiceReference, "INVOICE-1");
      order.push("record-invoice");
    }
    return true;
  },
  async submitFrozenFa3(input) {
    assert.equal(input.xml, xml);
    assert.equal(input.sha256, sha256);
    assert.equal(input.sessionReference, "SESSION-1");
    assert.deepEqual(input.sessionHandle, { opaque: true });
    order.push("submit");
    return { invoiceReference: "INVOICE-1" };
  },
  async closeSession(input) {
    assert.equal(input.sessionReference, "SESSION-1");
    order.push("close");
  },
  async waitForAcceptance(input) {
    assert.equal(input.sessionReference, "SESSION-1");
    assert.equal(input.invoiceReference, "INVOICE-1");
    order.push("wait");
    return {
      ksefReferenceNumber: "KSEF-1",
      statusCode: 200,
      upoXml: "<UPO>accepted</UPO>",
      acceptedAt: "2026-08-14T22:00:00Z",
    };
  },
  async recordReconciliationError() {
    reconcileErrors += 1;
    return true;
  },
  async recordAcceptance(input) {
    assert.match(input.upoSha256, /^[0-9a-f]{64}$/);
    order.push("accept");
    accepted += 1;
    return true;
  },
});

assert.equal(success.attemptNumber, 1);
assert.equal(success.sessionReference, "SESSION-1");
assert.equal(success.invoiceReference, "INVOICE-1");
assert.equal(accepted, 1);
assert.equal(reconcileErrors, 0);
assert.deepEqual(order, [
  "start",
  "open",
  "record-session",
  "submit",
  "record-invoice",
  "close",
  "wait",
  "accept",
]);

// If persisting the session reference fails, the legal invoice must never be sent.
let submitAfterSessionPersistenceFailure = false;
let persistenceFailureReconciliations = 0;
await assert.rejects(
  () => issueFrozenSellerDocumentToKsef(
    { ...document, lifecycle_status: "failed" },
    {
      async startAttempt() { return 2; },
      async openSession() { return { sessionReference: "SESSION-PERSIST-FAIL", sessionHandle: {} }; },
      async recordReferences() { return false; },
      async submitFrozenFa3() {
        submitAfterSessionPersistenceFailure = true;
        return { invoiceReference: "MUST-NOT-HAPPEN" };
      },
      async closeSession() { throw new Error("must not run"); },
      async waitForAcceptance() { throw new Error("must not run"); },
      async recordReconciliationError(input) {
        assert.match(input.error, /session reference could not be persisted/i);
        persistenceFailureReconciliations += 1;
        return true;
      },
      async recordAcceptance() { throw new Error("must not run"); },
    },
  ),
  /invoice was not submitted/i,
);
assert.equal(submitAfterSessionPersistenceFailure, false);
assert.equal(persistenceFailureReconciliations, 1);

// If the invoice POST is ambiguous, the already-persisted session reference
// remains the durable anchor for later reconciliation and no automatic retry occurs.
const ambiguousOrder: string[] = [];
let ambiguousReconcileErrors = 0;
await assert.rejects(
  () => issueFrozenSellerDocumentToKsef(
    { ...document, lifecycle_status: "failed" },
    {
      async startAttempt() { ambiguousOrder.push("start"); return 3; },
      async openSession() {
        ambiguousOrder.push("open");
        return { sessionReference: "SESSION-AMBIGUOUS", sessionHandle: { key: "memory-only" } };
      },
      async recordReferences(input) {
        assert.equal(input.invoiceReference, null);
        assert.equal(input.sessionReference, "SESSION-AMBIGUOUS");
        ambiguousOrder.push("record-session");
        return true;
      },
      async submitFrozenFa3(input) {
        assert.equal(input.xml, xml);
        assert.equal(input.sha256, sha256);
        ambiguousOrder.push("submit-timeout");
        throw new Error("synthetic ambiguous network timeout after invoice POST");
      },
      async closeSession() { throw new Error("must not run"); },
      async waitForAcceptance() { throw new Error("must not run"); },
      async recordReconciliationError(input) {
        assert.match(input.error, /ambiguous network timeout/);
        ambiguousOrder.push("reconcile");
        ambiguousReconcileErrors += 1;
        return true;
      },
      async recordAcceptance() { throw new Error("must not run"); },
    },
  ),
  /ambiguous network timeout/,
);
assert.equal(ambiguousReconcileErrors, 1);
assert.deepEqual(ambiguousOrder, ["start", "open", "record-session", "submit-timeout", "reconcile"]);

await assert.rejects(
  () => issueFrozenSellerDocumentToKsef({ ...document, lifecycle_status: "ksef_pending" }, {} as never),
  /not ready for a KSeF issuance attempt/,
);

console.log("KSeF issuance persist-before-send and ambiguity regressions passed.");
