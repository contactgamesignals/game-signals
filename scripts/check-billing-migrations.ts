import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const location = read("supabase/migrations/20260814013000_add_billing_location_evidence.sql");
const disputes = read("supabase/migrations/20260814014500_add_billing_dispute_ledger.sql");
const vies = read("supabase/migrations/20260814015500_add_vies_evidence_ledger.sql");
const checkout = read("supabase/migrations/20260814123300_prevent_duplicate_subscription_checkout.sql");
const orderingFinal = read("supabase/migrations/20260814130000_harden_subscription_event_rpc_invoker.sql");
const checkoutReconcile = read("supabase/migrations/20260814130500_reconcile_checkout_attempt_on_subscription.sql");
const checkoutLifecycleFinal = read("supabase/migrations/20260814132000_return_recent_completed_checkout_attempt.sql");
const archive = read("supabase/migrations/20260814140000_preserve_financial_records_after_account_deletion.sql");
const archiveTriggerHardening = read("supabase/migrations/20260814140500_harden_billing_archive_internal_triggers.sql");

for (const [name, sql] of [
  ["location evidence", location],
  ["disputes", disputes],
  ["VIES evidence", vies],
  ["checkout attempts", checkout],
] as const) {
  assert.match(sql, /enable row level security/i, `${name}: RLS must be enabled`);
  assert.match(sql, /revoke[\s\S]*anon/i, `${name}: anon access must be explicitly revoked`);
  assert.match(sql, /revoke[\s\S]*(authenticated|insert, update, delete)/i, `${name}: browser writes must be revoked`);
  assert.match(sql, /service_role/i, `${name}: server role access must be explicit`);
}

assert.match(location, /does NOT store card number, last4,[\s\S]*raw IP/i);
assert.match(location, /billing_location_evidence_select_manager/);
assert.match(disputes, /billing_dispute_records_select_manager/);
assert.match(vies, /billing_vies_evidence_select_manager/);
assert.match(vies, /never decides VAT/i);

assert.match(checkout, /unique index billing_checkout_attempts_one_active_workspace_idx/i);
assert.match(checkout, /where status in \('creating', 'open'\)/i);
assert.match(checkout, /for update/i);
assert.match(checkout, /security invoker/i);
assert.match(checkout, /from public, anon, authenticated/i);
assert.match(checkout, /to service_role/i);

assert.match(orderingFinal, /create or replace function public\.apply_subscription_stripe_event/);
assert.match(orderingFinal, /security invoker/i);
assert.doesNotMatch(orderingFinal, /security definer/i);
assert.match(orderingFinal, /from public, anon, authenticated/i);
assert.match(orderingFinal, /to service_role/i);

assert.match(checkoutReconcile, /reconcile_checkout_attempt_after_subscription/);
assert.match(checkoutReconcile, /security invoker/i);
assert.match(checkoutReconcile, /new\.stripe_subscription_id is not null/i);
assert.match(checkoutReconcile, /'active'::public\.subscription_status, 'trialing'::public\.subscription_status/i);
assert.match(checkoutReconcile, /a\.status in \('creating', 'open'\)/i);

assert.match(checkoutLifecycleFinal, /create or replace function public\.reserve_subscription_checkout/);
assert.match(checkoutLifecycleFinal, /security invoker/i);
assert.match(checkoutLifecycleFinal, /a\.expires_at <= now\(\)/i);
assert.match(checkoutLifecycleFinal, /set status = 'expired'/i);
assert.match(checkoutLifecycleFinal, /a\.status = 'completed'/i);
assert.match(checkoutLifecycleFinal, /interval '15 minutes'/i);
assert.match(checkoutLifecycleFinal, /return query[\s\S]*v_attempt\.stripe_checkout_session_id/i);
assert.match(checkoutLifecycleFinal, /from public, anon, authenticated/i);
assert.match(checkoutLifecycleFinal, /to service_role/i);

// Seller-side financial archive: product/account deletion must detach retained records,
// never cascade-delete them. The immutable billing account itself is internal-only.
assert.match(archive, /create table public\.billing_accounts/i);
assert.match(archive, /workspace_reference uuid not null unique/i);
assert.match(archive, /workspace_id uuid unique references public\.workspaces\(id\) on delete set null/i);
assert.match(archive, /stripe_customer_id text unique/i);
assert.match(archive, /latest_stripe_subscription_id text unique/i);
assert.match(archive, /alter table public\.billing_accounts enable row level security/i);
assert.match(archive, /revoke all on public\.billing_accounts from anon, authenticated/i);
assert.match(archive, /grant select, insert, update, delete on public\.billing_accounts to service_role/i);

for (const table of [
  "billing_invoice_records",
  "billing_adjustment_records",
  "billing_checkout_consents",
  "billing_location_evidence",
  "billing_dispute_records",
  "billing_vies_evidence",
]) {
  assert.match(
    archive,
    new RegExp(`alter table public\\.${table}[\\s\\S]*add column if not exists billing_account_id uuid references public\\.billing_accounts\\(id\\) on delete restrict`, "i"),
    `${table}: durable billing_account_id must be added`,
  );
  assert.match(
    archive,
    new RegExp(`alter table public\\.${table} alter column billing_account_id set not null`, "i"),
    `${table}: durable billing_account_id must become NOT NULL after backfill`,
  );
  assert.match(
    archive,
    new RegExp(`alter table public\\.${table}[\\s\\S]*foreign key \\(workspace_id\\) references public\\.workspaces\\(id\\) on delete set null`, "i"),
    `${table}: workspace FK must detach with SET NULL`,
  );
}

assert.match(archive, /billing_checkout_consents[\s\S]*alter column user_id drop not null/i);
assert.match(archive, /billing_checkout_consents_user_id_fkey[\s\S]*references auth\.users\(id\) on delete set null/i);
assert.match(archive, /attach_billing_account_to_financial_record/);
assert.match(archive, /A durable billing account is required for retained financial evidence/);
assert.match(archive, /archive_billing_account_before_workspace_delete/);
assert.match(archive, /account_deleted_at = coalesce\(a\.account_deleted_at, now\(\)\)/i);
assert.match(archive, /resolve_billing_account_from_stripe/);
assert.match(archive, /from public, anon, authenticated/i);
assert.match(archive, /to service_role/i);

// Only the narrowly scoped trigger-only maintenance functions are SECURITY DEFINER;
// their final definitions live in private schema with fixed search_path and no browser EXECUTE.
for (const fn of [
  "ensure_billing_account_for_workspace",
  "sync_billing_account_from_subscription",
  "archive_billing_account_before_workspace_delete",
]) {
  assert.match(
    archiveTriggerHardening,
    new RegExp(`create or replace function private\\.${fn}\\(\\)[\\s\\S]*security definer[\\s\\S]*set search_path = public, private, pg_temp`, "i"),
    `${fn}: trigger-only final definition must be tightly scoped SECURITY DEFINER`,
  );
  assert.match(
    archiveTriggerHardening,
    new RegExp(`revoke all on function private\\.${fn}\\(\\) from public, anon, authenticated`, "i"),
    `${fn}: browser EXECUTE must remain revoked`,
  );
}

console.log("Billing migration security, retention and lifecycle invariants passed.");
