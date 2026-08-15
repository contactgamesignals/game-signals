import assert from "node:assert/strict";

import {
  buildOpenFa3OnlineSessionRequest,
  buildSendOnlineInvoiceRequest,
} from "../lib/ksef/request-builders.ts";

assert.deepEqual(buildOpenFa3OnlineSessionRequest({
  encryptedSymmetricKey: "encrypted-key",
  initializationVector: "initialization-vector",
  publicKeyId: "public-key-id",
}), {
  formCode: {
    systemCode: "FA (3)",
    schemaVersion: "1-0E",
    value: "FA",
  },
  encryption: {
    encryptedSymmetricKey: "encrypted-key",
    initializationVector: "initialization-vector",
    publicKeyId: "public-key-id",
  },
});

assert.deepEqual(buildSendOnlineInvoiceRequest({
  invoiceHash: "plain-hash",
  invoiceSize: 123,
  encryptedInvoiceHash: "encrypted-hash",
  encryptedInvoiceSize: 144,
  encryptedInvoiceContent: "encrypted-content",
}), {
  invoiceHash: "plain-hash",
  invoiceSize: 123,
  encryptedInvoiceHash: "encrypted-hash",
  encryptedInvoiceSize: 144,
  encryptedInvoiceContent: "encrypted-content",
  offlineMode: false,
});

assert.deepEqual(buildSendOnlineInvoiceRequest({
  invoiceHash: "plain-hash",
  invoiceSize: 123,
  encryptedInvoiceHash: "encrypted-hash",
  encryptedInvoiceSize: 144,
  encryptedInvoiceContent: "encrypted-content",
  hashOfCorrectedInvoice: "corrected-hash",
  offlineMode: true,
}), {
  invoiceHash: "plain-hash",
  invoiceSize: 123,
  encryptedInvoiceHash: "encrypted-hash",
  encryptedInvoiceSize: 144,
  encryptedInvoiceContent: "encrypted-content",
  hashOfCorrectedInvoice: "corrected-hash",
  offlineMode: true,
});

assert.throws(() => buildOpenFa3OnlineSessionRequest({
  encryptedSymmetricKey: "",
  initializationVector: "iv",
  publicKeyId: "public-key-id",
}), /encryptedSymmetricKey/);

assert.throws(() => buildOpenFa3OnlineSessionRequest({
  encryptedSymmetricKey: "encrypted-key",
  initializationVector: "iv",
  publicKeyId: "",
}), /publicKeyId/);

assert.throws(() => buildSendOnlineInvoiceRequest({
  invoiceHash: "hash",
  invoiceSize: -1,
  encryptedInvoiceHash: "encrypted-hash",
  encryptedInvoiceSize: 1,
  encryptedInvoiceContent: "content",
}), /invoiceSize/);

console.log("KSeF request builder regression checks passed.");
