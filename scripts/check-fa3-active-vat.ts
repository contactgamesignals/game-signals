import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import {
  buildFa3StandardVatPolishB2bInvoice,
  splitPolishVat23FromGross,
} from "@/lib/ksef/fa3-active-vat";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Output XML path is required.");

assert.deepEqual(splitPolishVat23FromGross(2450), {
  grossAmountMinor: 2450,
  netAmountMinor: 1992,
  vatAmountMinor: 458,
});
assert.deepEqual(splitPolishVat23FromGross(6450), {
  grossAmountMinor: 6450,
  netAmountMinor: 5244,
  vatAmountMinor: 1206,
});

const draft = buildFa3StandardVatPolishB2bInvoice({
  invoiceNumber: "GS/TEST/2026/0001",
  issueDate: "2026-08-14",
  createdAt: "2026-08-14T20:00:00Z",
  buyer: {
    nip: "5250001009",
    name: "GameSignal FA3 Active VAT Test Buyer sp. z o.o.",
    address: {
      countryCode: "PL",
      line1: "ul. Testowa 1, 00-001 Warszawa",
    },
  },
  serviceName: "GameSignal Indie subscription",
  grossAmountMinor: 2450,
  currency: "PLN",
  servicePeriod: {
    from: "2026-08-14",
    to: "2026-09-13",
  },
  stripeInvoiceId: "in_gamesignal_fa3_active_vat_test",
});

assert.equal(draft.taxTreatment, "vat_23_inclusive");
assert.equal(draft.netAmountMinor, 1992);
assert.equal(draft.vatAmountMinor, 458);
assert.match(draft.xml, /<P_13_1>19\.92<\/P_13_1>/);
assert.match(draft.xml, /<P_14_1>4\.58<\/P_14_1>/);
assert.match(draft.xml, /<P_15>24\.50<\/P_15>/);
assert.match(draft.xml, /<P_12>23<\/P_12>/);
assert.match(draft.xml, /<Zwolnienie><P_19N>1<\/P_19N><\/Zwolnienie>/);
assert.doesNotMatch(draft.xml, /<P_12>zw<\/P_12>/);
assert.doesNotMatch(draft.xml, /<P_19A>/);
assert.match(draft.xml, /Kazimierza Morawskiego 5\/127/);

writeFileSync(outputPath, draft.xml, "utf8");
console.log("Active-VAT FA(3) sample generated with inclusive 23% VAT split.");
