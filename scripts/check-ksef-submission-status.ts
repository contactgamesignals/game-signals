import assert from "node:assert/strict";
import { classifyKsefInvoiceStatus } from "../lib/ksef/submission-status-core.ts";

assert.deepEqual(classifyKsefInvoiceStatus({
  status: { code: 100, description: "Accepted for processing" },
}), { kind: "processing", statusCode: 100 });

assert.deepEqual(classifyKsefInvoiceStatus({
  status: { code: 150, description: "Processing" },
}), { kind: "processing", statusCode: 150 });

assert.deepEqual(classifyKsefInvoiceStatus({
  referenceNumber: "INV-REF",
  invoicingDate: "2026-08-15T01:00:00Z",
  acquisitionDate: "2026-08-15T01:00:02Z",
  ksefNumber: "6762600090-20260815-UNITTEST-00",
  status: { code: 200, description: "Success" },
}), {
  kind: "accepted",
  statusCode: 200,
  ksefNumber: "6762600090-20260815-UNITTEST-00",
  acquisitionDate: "2026-08-15T01:00:02Z",
  invoicingDate: "2026-08-15T01:00:00Z",
});

assert.deepEqual(classifyKsefInvoiceStatus({
  status: {
    code: 440,
    description: "Duplicate invoice",
    extensions: {
      originalSessionReferenceNumber: "ORIGINAL-SESSION",
      originalKsefNumber: "ORIGINAL-KSEF-NUMBER",
    },
  },
}), {
  kind: "duplicate",
  statusCode: 440,
  originalSessionReferenceNumber: "ORIGINAL-SESSION",
  originalKsefNumber: "ORIGINAL-KSEF-NUMBER",
});

assert.deepEqual(classifyKsefInvoiceStatus({
  status: { code: 450, description: "Semantic validation error" },
}), {
  kind: "rejected",
  statusCode: 450,
  description: "Semantic validation error",
});

assert.deepEqual(classifyKsefInvoiceStatus({
  status: { code: 550, description: "System canceled operation" },
}), {
  kind: "rejected",
  statusCode: 550,
  description: "System canceled operation",
});

assert.deepEqual(classifyKsefInvoiceStatus({
  status: { code: 170, description: "Unexpected invoice state" },
}), {
  kind: "unknown",
  statusCode: 170,
  description: "Unexpected invoice state",
});

assert.throws(() => classifyKsefInvoiceStatus({
  status: { code: 200, description: "Success" },
  ksefNumber: null,
  acquisitionDate: "2026-08-15T01:00:02Z",
  invoicingDate: "2026-08-15T01:00:00Z",
}), /ksefNumber/);

console.log("KSeF invoice processing, acceptance, duplicate and rejection status regressions passed.");
