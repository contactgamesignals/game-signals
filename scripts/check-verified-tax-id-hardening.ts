import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260814230400_require_verified_polish_tax_id.sql", "utf8");

assert.doesNotMatch(migration, /\bdrop\s+table\b|\bdrop\s+column\b|\btruncate\s+table\b|\bdelete\s+from\b/i);
assert.match(migration, /create or replace function private\.billing_has_polish_tax_id/i);
assert.match(migration, /pl_nip', 'eu_vat/i);
assert.match(migration, /regexp_replace[\s\S]*\^\[0-9\]\{10\}\$/i);
assert.match(migration, /verification_status/i);
assert.match(migration, /= 'verified'/i);
assert.match(migration, /revoke all on function private\.billing_has_polish_tax_id\(jsonb\)[\s\S]*from public, anon, authenticated/i);
assert.match(migration, /grant execute on function private\.billing_has_polish_tax_id\(jsonb\)[\s\S]*to service_role/i);

console.log("Verified Polish tax-ID hardening invariants passed.");
