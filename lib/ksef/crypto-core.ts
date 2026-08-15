import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  publicEncrypt,
  randomBytes,
  X509Certificate,
} from "node:crypto";

export type KsefFileMetadata = {
  fileSize: number;
  hashSha256Base64: string;
};

function requireLength(value: Buffer, bytes: number, label: string) {
  if (value.length !== bytes) throw new Error(`${label} must be exactly ${bytes} bytes.`);
}

export function generateKsefSessionKey() {
  return randomBytes(32);
}

export function generateKsefSessionIv() {
  return randomBytes(16);
}

export function getKsefFileMetadata(content: Buffer): KsefFileMetadata {
  return {
    fileSize: content.length,
    hashSha256Base64: createHash("sha256").update(content).digest("base64"),
  };
}

/**
 * Matches the current MF C# and Java reference clients: AES-256-CBC with
 * PKCS#7-compatible padding. The returned bytes are ciphertext only; the IV
 * is sent separately in KSeF EncryptionInfo and is NOT prefixed here.
 */
export function encryptKsefInvoiceBytes(content: Buffer, key: Buffer, iv: Buffer) {
  requireLength(key, 32, "KSeF AES key");
  requireLength(iv, 16, "KSeF AES IV");
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(content), cipher.final()]);
}

/** Test/support helper only; invoice submission itself does not need decrypt. */
export function decryptKsefInvoiceBytes(content: Buffer, key: Buffer, iv: Buffer) {
  requireLength(key, 32, "KSeF AES key");
  requireLength(iv, 16, "KSeF AES IV");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([decipher.update(content), decipher.final()]);
}

/**
 * Encrypt a generated 256-bit session key with the current KSeF X.509
 * certificate using RSA-OAEP SHA-256, matching the MF reference clients.
 */
export function encryptKsefSessionKeyWithCertificate(input: {
  sessionKey: Buffer;
  certificateDerBase64: string;
}) {
  requireLength(input.sessionKey, 32, "KSeF AES key");
  const certificateBytes = Buffer.from(input.certificateDerBase64.trim(), "base64");
  if (!certificateBytes.length) throw new Error("KSeF encryption certificate is empty.");
  const certificate = new X509Certificate(certificateBytes);
  return publicEncrypt({
    key: certificate.publicKey,
    padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, input.sessionKey);
}

export function buildKsefEncryptedInvoicePayload(input: {
  invoiceXml: string;
  key: Buffer;
  iv: Buffer;
}) {
  if (!input.invoiceXml.trim()) throw new Error("Invoice XML is required.");
  const plain = Buffer.from(input.invoiceXml, "utf8");
  const encrypted = encryptKsefInvoiceBytes(plain, input.key, input.iv);
  const plainMetadata = getKsefFileMetadata(plain);
  const encryptedMetadata = getKsefFileMetadata(encrypted);

  return {
    invoiceHash: plainMetadata.hashSha256Base64,
    invoiceSize: plainMetadata.fileSize,
    encryptedInvoiceHash: encryptedMetadata.hashSha256Base64,
    encryptedInvoiceSize: encryptedMetadata.fileSize,
    encryptedInvoiceContent: encrypted.toString("base64"),
  } as const;
}
