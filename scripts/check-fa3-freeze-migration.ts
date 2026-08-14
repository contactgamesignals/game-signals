import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260814231000_freeze_seller_document_fa3_payload.sql", "utf8");

assert.doesNotMatch(migration, /\bdrop\s+table\b|\bdrop\s+column\b|\btruncate\s+table\b|\bdelete\s+from\b/i);
assert.match(migration, /add column if not exists fa3_xml text/i);
assert.match(migration, /add column if not exists fa3_sha256 text/i);
assert.match(migration, /add column if not exists fa3_size_bytes bigint/i);
assert.match(migration, /add column if not exists fa3_generated_at timestamptz/i);
assert.match(migration, /fa3_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/i);
assert.match(migration, /octet_length\(convert_to\(p_fa3_xml, 'UTF8'\)\)/i);
assert.match(migration, /source_livemode is not true/i);
assert.match(migration, /Legal document number must be reserved before freezing FA\(3\)/i);
assert.match(migration, /doc\.fa3_xml is not null/i);
assert.match(migration, /FA\(3\) payload is already frozen and cannot be replaced/i);
assert.match(migration, /revoke all on function public\.freeze_seller_document_fa3[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.freeze_seller_document_fa3[\s\S]*to service_role/i);
assert.doesNotMatch(migration, /security definer/i);

console.log("Legal FA(3) freeze migration invariants passed.");
