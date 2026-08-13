import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";

import { buildFa3VatExemptPolishB2bInvoice } from "@/lib/ksef/fa3";

const outputPath = process.argv[2] ?? "/tmp/gamesignal-fa3-sample.xml";

const draft = buildFa3VatExemptPolishB2bInvoice({
  invoiceNumber: "GS-TEST/2026/000001",
  issueDate: "2026-08-13",
  createdAt: "2026-08-13T12:00:00Z",
  buyer: {
    nip: "1234567890",
    name: "FA3 TEST BUYER sp. z o.o.",
    address: {
      countryCode: "PL",
      line1: "ul. Testowa 1, 00-001 Warszawa",
    },
  },
  serviceName: "GameSignal Studio subscription - schema validation sample",
  amountMinor: 6450,
  servicePeriod: {
    from: "2026-08-13",
    to: "2026-09-12",
  },
  exemptionLegalBasis: "TEST ONLY - legal basis must be confirmed for the real invoice date",
  stripeInvoiceId: "TEST-INVOICE-REFERENCE",
});

assert.equal(draft.schema, "FA(3)");
assert.equal(draft.schemaVersion, "1-0E");
assert.equal(draft.taxTreatment, "vat_exempt");
assert.equal(draft.amountMinor, 6450);
assert.match(draft.xml, /<P_13_7>64\.50<\/P_13_7>/);
assert.match(draft.xml, /<P_15>64\.50<\/P_15>/);
assert.match(draft.xml, /<P_12>zw<\/P_12>/);
assert.match(draft.xml, /<Zwolnienie><P_19>1<\/P_19><P_19A>/);

writeFileSync(outputPath, draft.xml, "utf8");
console.log(`FA(3) draft written to ${outputPath}`);
