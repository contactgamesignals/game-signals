import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { matchFrozenSellerDocumentInKsefSession } from "../lib/ksef/reconciliation-core.ts";

const xml = "<Faktura>reconciliation-core</Faktura>";
const hex = createHash("sha256").update(Buffer.from(xml, "utf8")).digest("hex");
const base64 = createHash("sha256").update(Buffer.from(xml, "utf8")).digest("base64");
const legalNumber = "GS/2026/000123";

assert.deepEqual(matchFrozenSellerDocumentInKsefSession({
  legalDocumentNumber: legalNumber,
  frozenFa3Sha256Hex: hex,
  invoices: [
    { invoiceNumber: legalNumber, invoiceHash: base64, referenceNumber: "REF-1" },
  ],
}), { kind: "matched", referenceNumber: "REF-1" });

assert.deepEqual(matchFrozenSellerDocumentInKsefSession({
  legalDocumentNumber: legalNumber,
  frozenFa3Sha256Hex: hex,
  invoices: [
    { invoiceNumber: legalNumber, invoiceHash: "wrong-hash", referenceNumber: "WEAK-HASH" },
    { invoiceNumber: "OTHER/NUMBER", invoiceHash: base64, referenceNumber: "WEAK-NUMBER" },
    { invoiceNumber: legalNumber, invoiceHash: base64, referenceNumber: null },
  ],
}), { kind: "not_found" });

assert.deepEqual(matchFrozenSellerDocumentInKsefSession({
  legalDocumentNumber: legalNumber,
  frozenFa3Sha256Hex: hex,
  invoices: [
    { invoiceNumber: legalNumber, invoiceHash: base64, referenceNumber: "REF-SAME" },
    { invoiceNumber: legalNumber, invoiceHash: base64, referenceNumber: "REF-SAME" },
  ],
}), { kind: "matched", referenceNumber: "REF-SAME" });

assert.deepEqual(matchFrozenSellerDocumentInKsefSession({
  legalDocumentNumber: legalNumber,
  frozenFa3Sha256Hex: hex,
  invoices: [
    { invoiceNumber: legalNumber, invoiceHash: base64, referenceNumber: "REF-A" },
    { invoiceNumber: legalNumber, invoiceHash: base64, referenceNumber: "REF-B" },
  ],
}), { kind: "ambiguous", matchingReferenceNumbers: ["REF-A", "REF-B"] });

assert.throws(() => matchFrozenSellerDocumentInKsefSession({
  legalDocumentNumber: legalNumber,
  frozenFa3Sha256Hex: "not-a-sha",
  invoices: [],
}), /64-character hex/);

console.log("KSeF frozen-number plus SHA reconciliation matching regressions passed.");
