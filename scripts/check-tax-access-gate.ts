import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

const statusMigration = read("supabase/migrations/20260814222000_add_blocked_tax_subscription_status.sql");
const gateMigration = read("supabase/migrations/20260814222100_add_subscription_tax_access_gate.sql");
const invoiceGateMigration = read("supabase/migrations/20260814222200_gate_entitlements_from_invoice_tax_evidence.sql");

for (const [name, sql] of [
  ["blocked-tax status", statusMigration],
  ["subscription tax gate", gateMigration],
  ["invoice tax gate", invoiceGateMigration],
] as const) {
  assert.doesNotMatch(sql, /\bdrop\s+table\b|\bdrop\s+column\b|\btruncate\s+table\b|\bdelete\s+from\b/i, `${name}: destructive data/schema operation detected`);
}

assert.match(statusMigration, /alter type public\.subscription_status add value if not exists 'blocked_tax'/i);

assert.match(gateMigration, /add column if not exists stripe_status_raw public\.subscription_status/i);
assert.match(gateMigration, /add column if not exists tax_access_status text not null default 'approved'/i);
assert.match(gateMigration, /add column if not exists tax_access_subscription_id text/i);
assert.match(gateMigration, /tax_access_status in \('pending', 'approved', 'review'\)/i);
assert.match(gateMigration, /p_stripe_subscription_id is distinct from s\.tax_access_subscription_id/i);
assert.match(gateMigration, /then 'pending'/i);
assert.match(gateMigration, /then 'blocked_tax'::public\.subscription_status/i);
assert.match(gateMigration, /create or replace function public\.set_subscription_tax_access/i);
assert.match(gateMigration, /revoke all on function public\.set_subscription_tax_access[\s\S]*from public, anon, authenticated/i);
assert.match(gateMigration, /grant execute on function public\.set_subscription_tax_access[\s\S]*to service_role/i);
assert.doesNotMatch(gateMigration, /security definer/i);

assert.match(invoiceGateMigration, /create or replace function private\.apply_invoice_tax_access_gate/i);
assert.match(invoiceGateMigration, /upper\(new\.customer_country\) = 'PL'/i);
assert.match(invoiceGateMigration, /coalesce\(new\.tax_amount, 0\) > 0/i);
assert.match(invoiceGateMigration, /decision := 'approved'/i);
assert.match(invoiceGateMigration, /pl_vat_missing_on_paid_invoice/i);
assert.match(invoiceGateMigration, /cross_border_consumer_tax_route_not_live/i);
assert.match(invoiceGateMigration, /perform public\.set_subscription_tax_access/i);
assert.match(invoiceGateMigration, /revoke all on function private\.apply_invoice_tax_access_gate\(\)[\s\S]*from public, anon, authenticated/i);

console.log("Tax-access gate migration invariants passed.");
