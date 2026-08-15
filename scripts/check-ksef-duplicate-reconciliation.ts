import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "supabase/migrations/20260815021500_add_ksef_duplicate_reconciliation.sql"),
  "utf8",
);
const reconciliation = readFileSync(join(root, "lib/ksef/reconciliation.ts"), "utf8");
const state = readFileSync(join(root, "lib/ksef/seller-document-state.ts"), "utf8");

for (const column of [
  "ksef_original_session_reference",
  "ksef_original_invoice_reference",
  "ksef_duplicate_status_code",
  "ksef_duplicate_detected_at",
]) {
  assert.match(migration, new RegExp(`add column if not exists ${column}`));
}

assert.match(migration, /ksef_duplicate_status_code = 440/);
assert.match(migration, /lifecycle_status = 'ksef_accepted'/);
assert.match(migration, /ksef_status_code = 200/);
assert.match(migration, /create or replace function public\.accept_seller_document_ksef_duplicate/);
assert.match(migration, /p_duplicate_status_code <> 440/);
assert.match(migration, /p_accepted_status_code <> 200/);
assert.match(migration, /extensions\.digest\(convert_to\(p_upo_xml, 'UTF8'\), 'sha256'\)/);
assert.match(migration, /d\.source_livemode is true/);
assert.match(migration, /d\.lifecycle_status = 'ksef_pending'/);
assert.match(migration, /d\.fa3_sha256 = lower\(btrim\(coalesce\(p_expected_fa3_sha256, ''\)\)\)/);
assert.match(migration, /d\.ksef_session_reference/);
assert.match(migration, /d\.ksef_invoice_reference/);
assert.match(migration, /d\.ksef_reference_number is null/);
assert.match(migration, /d\.ksef_accepted_at is null/);
assert.match(migration, /revoke all on function public\.accept_seller_document_ksef_duplicate[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.accept_seller_document_ksef_duplicate[\s\S]*to service_role/);

assert.match(state, /export async function recordDuplicateKsefAcceptance/);
assert.match(state, /input\.duplicateStatusCode !== 440/);
assert.match(state, /input\.acceptedStatusCode !== 200/);
assert.match(state, /"accept_seller_document_ksef_duplicate"/);

assert.match(reconciliation, /status\.kind === "duplicate"/);
assert.match(reconciliation, /status\.originalSessionReferenceNumber/);
assert.match(reconciliation, /status\.originalKsefNumber/);
assert.match(reconciliation, /sessionReference: originalSessionReference/);
assert.match(reconciliation, /frozenFa3Sha256Hex: expectedSha256/);
assert.match(reconciliation, /originalStatus\.kind !== "accepted"/);
assert.match(reconciliation, /originalStatus\.ksefNumber !== originalKsefNumber/);
assert.match(reconciliation, /recordDuplicateKsefAcceptance/);
assert.match(reconciliation, /kind: "accepted_duplicate"/);

const duplicateStart = reconciliation.indexOf('if (status.kind === "duplicate")');
const originalRecovery = reconciliation.indexOf("const originalRecovery = await recoverKsefInvoiceReference", duplicateStart);
const originalStatus = reconciliation.indexOf("const rawOriginalStatus = await getKsefSessionInvoiceStatus", originalRecovery);
const ksefNumberCheck = reconciliation.indexOf("originalStatus.ksefNumber !== originalKsefNumber", originalStatus);
const originalUpo = reconciliation.indexOf("const upoXml = await getKsefInvoiceUpo", ksefNumberCheck);
const durableAccept = reconciliation.indexOf("await recordDuplicateKsefAcceptance", originalUpo);

assert.ok(duplicateStart >= 0, "duplicate branch missing");
assert.ok(originalRecovery > duplicateStart, "original session must be matched before acceptance");
assert.ok(originalStatus > originalRecovery, "matched original invoice status must be checked");
assert.ok(ksefNumberCheck > originalStatus, "original KSeF number must be compared to status 440 evidence");
assert.ok(originalUpo > ksefNumberCheck, "UPO must be fetched only after original invoice identity is verified");
assert.ok(durableAccept > originalUpo, "durable duplicate acceptance must happen after UPO retrieval");

// Reconciliation must remain read/reconcile-only. New legal submissions belong
// exclusively to the issuance workflow, never to a 440 recovery path.
assert.doesNotMatch(reconciliation, /openKsefOnlineSession/);
assert.doesNotMatch(reconciliation, /submitFrozenFa3/);
assert.doesNotMatch(reconciliation, /issueFrozenSellerDocumentToKsef/);

console.log("KSeF 440 duplicate reconciliation safeguards verified.");
