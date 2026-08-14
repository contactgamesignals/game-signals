import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const location = read("supabase/migrations/20260814013000_add_billing_location_evidence.sql");
const disputes = read("supabase/migrations/20260814014500_add_billing_dispute_ledger.sql");
const vies = read("supabase/migrations/20260814015500_add_vies_evidence_ledger.sql");
const checkout = read("supabase/migrations/20260814123300_prevent_duplicate_subscription_checkout.sql");
const orderingFinal = read("supabase/migrations/20260814130000_harden_subscription_event_rpc_invoker.sql");
const checkoutReconcile = read("supabase/migrations/20260814130500_reconcile_checkout_attempt_on_subscription.sql");

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

console.log("Billing migration security and lifecycle invariants passed.");
