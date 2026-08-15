import assert from "node:assert/strict";
import { buildFa3FromSellerDocumentSnapshot } from "@/lib/ksef/seller-document-fa3";

const base = {
  source_livemode: false,
  lifecycle_status: "sandbox_preview_ready",
  legal_document_number: null,
  stripe_invoice_id: "in_snapshot_test_001",
  seller_nip: "9999999999",
  seller_name: "Immutable Snapshot Seller sp. z o.o.",
  seller_address: "ul. Snapshot 1, 00-001 Warszawa, Poland",
  buyer_type: "company",
  buyer_name: "Snapshot Buyer sp. z o.o.",
  buyer_country: "PL",
  buyer_address: { line1: "ul. Kupującego 1", postal_code: "00-002", city: "Warszawa", country: "PL" },
  buyer_tax_ids: [{ type: "pl_nip", value: "5250001009", verification_status: "verified" }],
  currency: "pln",
  net_amount: 1992,
  tax_amount: 458,
  gross_amount: 2450,
  issue_date: "2026-08-14",
  service_period_start: "2026-08-14",
  service_period_end: "2026-09-13",
} as const;

const preview = buildFa3FromSellerDocumentSnapshot(base, {
  generatedAt: "2026-08-14T21:00:00Z",
  previewNumber: "PREVIEW/SNAPSHOT/001",
});

assert.equal(preview.invoiceNumber, "PREVIEW/SNAPSHOT/001");
assert.equal(preview.netAmountMinor, 1992);
assert.equal(preview.vatAmountMinor, 458);
assert.match(preview.xml, /<NIP>9999999999<\/NIP>/);
assert.match(preview.xml, /Immutable Snapshot Seller sp\. z o\.o\./);
assert.match(preview.xml, /ul\. Snapshot 1, 00-001 Warszawa, Poland/);
assert.doesNotMatch(preview.xml, /6762600090/);
assert.doesNotMatch(preview.xml, /Lumino Games/);

const live = buildFa3FromSellerDocumentSnapshot({
  ...base,
  source_livemode: true,
  lifecycle_status: "ready_for_issue",
  legal_document_number: "GS/2026/000001",
}, {
  generatedAt: "2026-08-14T21:01:00Z",
});
assert.equal(live.invoiceNumber, "GS/2026/000001");
assert.match(live.xml, /<P_2>GS\/2026\/000001<\/P_2>/);

assert.throws(
  () => buildFa3FromSellerDocumentSnapshot({ ...base, source_livemode: false, legal_document_number: "GS/2026/999999" }),
  /Sandbox seller document must never contain a legal document number/,
);
assert.throws(
  () => buildFa3FromSellerDocumentSnapshot({ ...base, source_livemode: true, lifecycle_status: "ready_for_issue", legal_document_number: null }),
  /must have a reserved legal document number/,
);
assert.throws(
  () => buildFa3FromSellerDocumentSnapshot({ ...base, tax_amount: 457, net_amount: 1993 }),
  /FA\(3\) amounts do not match the immutable seller-document snapshot/,
);

console.log("Seller-document FA(3) snapshot regression passed.");
