import assert from "node:assert/strict";
import {
  assertFrozenFa3Integrity,
  prepareFrozenSellerDocumentFa3,
  SELLER_DOCUMENT_FA3_GENERATOR_VERSION,
} from "@/lib/ksef/seller-document-preparation";

const snapshot = {
  source_livemode: true,
  lifecycle_status: "ready_for_issue",
  legal_document_number: "GS/2026/000001",
  stripe_invoice_id: "in_frozen_preparation_test",
  seller_nip: "9999999999",
  seller_name: "Frozen Snapshot Seller sp. z o.o.",
  seller_address: "ul. Frozen 1, 00-001 Warszawa, Poland",
  buyer_type: "company",
  buyer_name: "Frozen Buyer sp. z o.o.",
  buyer_country: "PL",
  buyer_address: { line1: "ul. Kupującego 2", postal_code: "00-002", city: "Warszawa", country: "PL" },
  buyer_tax_ids: [{ type: "pl_nip", value: "5250001009", verification_status: "verified" }],
  currency: "pln",
  net_amount: 1992,
  tax_amount: 458,
  gross_amount: 2450,
  issue_date: "2026-08-14",
  service_period_start: "2026-08-14",
  service_period_end: "2026-09-13",
} as const;

const generatedAt = "2026-08-14T21:30:00Z";
const first = await prepareFrozenSellerDocumentFa3(snapshot, generatedAt);
const second = await prepareFrozenSellerDocumentFa3(snapshot, generatedAt);

assert.equal(first.xml, second.xml);
assert.equal(first.sha256, second.sha256);
assert.equal(first.sizeBytes, second.sizeBytes);
assert.equal(first.generatedAt, generatedAt);
assert.equal(first.generatorVersion, SELLER_DOCUMENT_FA3_GENERATOR_VERSION);
assert.match(first.sha256, /^[0-9a-f]{64}$/);
assert.ok(first.sizeBytes > 0);
assert.equal(await assertFrozenFa3Integrity({ xml: first.xml, sha256: first.sha256, sizeBytes: first.sizeBytes }), true);

await assert.rejects(
  () => assertFrozenFa3Integrity({ xml: `${first.xml} `, sha256: first.sha256, sizeBytes: first.sizeBytes }),
  /size does not match/,
);
await assert.rejects(
  () => assertFrozenFa3Integrity({ xml: first.xml, sha256: "0".repeat(64), sizeBytes: first.sizeBytes }),
  /SHA-256 does not match/,
);

console.log("Frozen seller-document FA(3) preparation regression passed.");
