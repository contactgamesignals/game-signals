import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  buildKsefEncryptedInvoicePayload,
  decryptKsefInvoiceBytes,
  encryptKsefInvoiceBytes,
  getKsefFileMetadata,
} from "../lib/ksef/crypto-core.ts";

const key = Buffer.alloc(32, 0x27);
const iv = Buffer.alloc(16, 0x14);
const plain = Buffer.from("<Faktura>GameSignal KSeF regression</Faktura>", "utf8");

const encrypted = encryptKsefInvoiceBytes(plain, key, iv);
assert.notDeepEqual(encrypted, plain);
assert.equal(encrypted.length % 16, 0, "AES-CBC ciphertext must align to the block size.");
assert.deepEqual(decryptKsefInvoiceBytes(encrypted, key, iv), plain);

const metadata = getKsefFileMetadata(plain);
assert.equal(metadata.fileSize, plain.length);
assert.equal(metadata.hashSha256Base64, createHash("sha256").update(plain).digest("base64"));

const payload = buildKsefEncryptedInvoicePayload({
  invoiceXml: plain.toString("utf8"),
  key,
  iv,
});
assert.equal(payload.invoiceSize, plain.length);
assert.equal(payload.encryptedInvoiceSize, encrypted.length);
assert.equal(Buffer.from(payload.encryptedInvoiceContent, "base64").equals(encrypted), true);
assert.equal(payload.invoiceHash, metadata.hashSha256Base64);
assert.equal(payload.encryptedInvoiceHash, createHash("sha256").update(encrypted).digest("base64"));

assert.throws(() => encryptKsefInvoiceBytes(plain, Buffer.alloc(31), iv), /32 bytes/);
assert.throws(() => encryptKsefInvoiceBytes(plain, key, Buffer.alloc(15)), /16 bytes/);
assert.throws(() => buildKsefEncryptedInvoicePayload({ invoiceXml: "   ", key, iv }), /required/);

console.log("KSeF crypto regression checks passed.");
