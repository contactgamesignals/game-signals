import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/migrations/20260815013000_lock_seller_snapshot_after_number.sql", "utf8");

assert.doesNotMatch(sql, /\bdrop\s+table\b|\bdrop\s+column\b|\btruncate\s+table\b|\bdelete\s+from\b/i);
assert.match(sql, /create or replace function private\.queue_paid_polish_company_document\(\)/i);
assert.match(sql, /public\.billing_seller_documents\.legal_document_number is not null/i);

for (const field of [
  "buyer_name",
  "buyer_country",
  "buyer_address",
  "buyer_tax_ids",
  "currency",
  "net_amount",
  "tax_amount",
  "gross_amount",
  "issue_date",
  "service_period_start",
  "service_period_end",
  "stripe_billing_reason",
  "lifecycle_status",
]) {
  const pattern = new RegExp(
    `${field}\\s*=\\s*case[\\s\\S]*?legal_document_number is not null[\\s\\S]*?billing_seller_documents\\.${field}[\\s\\S]*?else excluded\\.${field}`,
    "i",
  );
  assert.match(sql, pattern, `${field} must remain immutable after legal numbering.`);
}

assert.match(sql, /revoke all on function private\.queue_paid_polish_company_document\(\)[\s\S]*from public, anon, authenticated/i);
assert.doesNotMatch(sql, /seller_nip\s*=|seller_name\s*=|seller_address\s*=|seller_profile_key\s*=/i);

console.log("Seller-document accounting snapshot immutability migration checks passed.");
