import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queue = readFileSync("supabase/migrations/20260814230000_add_seller_document_queue.sql", "utf8");
const hardening = readFileSync("supabase/migrations/20260814230100_harden_seller_document_queue.sql", "utf8");
const evidence = readFileSync("supabase/migrations/20260814230200_finalize_seller_document_queue_evidence.sql", "utf8");

for (const [name, sql] of [["queue", queue], ["hardening", hardening], ["evidence", evidence]] as const) {
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\bdrop\s+column\b|\btruncate\s+table\b|\bdelete\s+from\b/i, `${name}: destructive data/schema operation detected`);
}

assert.match(queue, /create table if not exists public\.billing_document_sequences/i);
assert.match(queue, /unique \(seller_nip, sequence_year, series\)/i);
assert.match(queue, /create table if not exists public\.billing_seller_documents/i);
assert.match(queue, /unique \(seller_nip, stripe_invoice_id, document_type\)/i);
assert.match(queue, /on delete set null/i);
assert.match(queue, /on delete restrict/i);
assert.match(queue, /Legal invoice numbers cannot be allocated to Stripe sandbox documents/i);
assert.match(queue, /doc\.source_livemode is not true/i);
assert.match(queue, /create or replace function public\.reserve_seller_document_number/i);
assert.match(queue, /for update/i);
assert.match(queue, /on conflict \(seller_nip, sequence_year, series\)/i);
assert.match(queue, /grant execute on function public\.reserve_seller_document_number[\s\S]*to service_role/i);
assert.match(queue, /revoke all on function public\.reserve_seller_document_number[\s\S]*from public, anon, authenticated/i);
assert.match(queue, /sandbox_preview_ready/i);
assert.match(queue, /ready_for_issue/i);

assert.match(hardening, /create table if not exists public\.billing_seller_profiles/i);
assert.match(hardening, /billing_seller_profiles_one_active_idx/i);
assert.match(hardening, /revoke all on public\.billing_seller_profiles from anon, authenticated/i);
assert.match(hardening, /seller_profile_key text references public\.billing_seller_profiles/i);
assert.match(hardening, /where active is true/i);
assert.match(hardening, /coalesce\(new\.stripe_status, ''\) <> 'paid'/i);
assert.match(hardening, /new\.currency is null/i);
assert.match(hardening, /seller\.profile_key/i);
assert.match(hardening, /seller\.nip/i);
assert.match(hardening, /seller\.legal_name/i);
assert.match(hardening, /seller\.registered_address/i);
assert.match(hardening, /on conflict \(seller_nip, stripe_invoice_id, document_type\)/i);
assert.doesNotMatch(hardening, /seller_nip constant|seller_name constant|seller_address constant/i);

assert.match(evidence, /add column if not exists service_period_start date/i);
assert.match(evidence, /add column if not exists service_period_end date/i);
assert.match(evidence, /create or replace function private\.billing_has_polish_tax_id/i);
assert.match(evidence, /pl_nip', 'eu_vat/i);
assert.match(evidence, /\^\[0-9\]\{10\}\$/i);
assert.match(evidence, /new\.customer_name is not null/i);
assert.match(evidence, /private\.billing_has_polish_tax_id\(new\.customer_tax_ids\)/i);
assert.match(evidence, /coalesce\(new\.tax_amount, 0\) > 0 and buyer_evidence_ready/i);
assert.match(evidence, /coalesce\(new\.finalized_at::date, new\.invoice_created_at::date, current_date\)/i);
assert.match(evidence, /new\.period_start::date/i);
assert.match(evidence, /new\.period_end::date/i);
assert.match(evidence, /new\.billing_reason/i);

console.log("Seller document queue, seller isolation, buyer evidence and legal numbering invariants passed.");
