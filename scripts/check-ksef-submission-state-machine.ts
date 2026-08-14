import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260814231200_add_ksef_submission_state_machine.sql", "utf8");

assert.doesNotMatch(migration, /forbidden_marker|DO_NOT_EXECUTE/i);
assert.doesNotMatch(migration, /\bdrop\s+table\b|\bdrop\s+column\b|\btruncate\s+table\b|\bdelete\s+from\b/i);
assert.match(migration, /add column if not exists ksef_attempt_count integer not null default 0/i);
assert.match(migration, /add column if not exists ksef_upo_xml text/i);
assert.match(migration, /create or replace function public\.start_seller_document_ksef_attempt/i);
assert.match(migration, /source_livemode is not true/i);
assert.match(migration, /legal_document_number is null or doc\.fa3_xml is null or doc\.fa3_sha256 is null/i);
assert.match(migration, /doc\.lifecycle_status = 'ksef_accepted'/i);
assert.match(migration, /ksef_attempt_count = next_attempt/i);
assert.match(migration, /create or replace function public\.record_seller_document_ksef_references/i);
assert.match(migration, /create or replace function public\.fail_seller_document_ksef_attempt/i);
assert.match(migration, /create or replace function public\.accept_seller_document_ksef/i);
assert.match(migration, /extensions\.digest\(convert_to\(p_upo_xml, 'UTF8'\), 'sha256'\)/i);
assert.match(migration, /UPO SHA-256 does not match the supplied UPO XML bytes/i);
assert.match(migration, /lifecycle_status = 'ksef_accepted'/i);
assert.match(migration, /revoke all on function public\.start_seller_document_ksef_attempt[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.start_seller_document_ksef_attempt[\s\S]*to service_role/i);
assert.match(migration, /grant execute on function public\.accept_seller_document_ksef[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /access[_ ]?token|refresh[_ ]?token|private[_ ]?key|certificate[_ ]?password/i);

console.log("KSeF submission state-machine invariants passed.");
