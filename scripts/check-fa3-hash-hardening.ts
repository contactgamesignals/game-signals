import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260814231100_verify_frozen_fa3_hash.sql", "utf8");

assert.doesNotMatch(migration, /\bdrop\s+table\b|\bdrop\s+column\b|\btruncate\s+table\b|\bdelete\s+from\b/i);
assert.match(migration, /extensions\.digest\(convert_to\(p_fa3_xml, 'UTF8'\), 'sha256'\)/i);
assert.match(migration, /normalized_hash <> actual_hash/i);
assert.match(migration, /FA\(3\) SHA-256 does not match the supplied XML bytes/i);
assert.match(migration, /octet_length\(convert_to\(p_fa3_xml, 'UTF8'\)\)/i);
assert.match(migration, /source_livemode is not true/i);
assert.match(migration, /FA\(3\) payload is already frozen and cannot be replaced/i);
assert.match(migration, /revoke all on function public\.freeze_seller_document_fa3[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.freeze_seller_document_fa3[\s\S]*to service_role/i);

console.log("Database FA(3) hash verification hardening invariants passed.");
