import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const drafts = [
  "supabase/functions/stripe-webhook-v8-draft/index.ts",
  "supabase/functions/stripe-billing-v11-draft/index.ts",
  "supabase/functions/delete-account-v3-draft/index.ts",
] as const;

for (const path of drafts) {
  const source = readFileSync(path, "utf8");
  const result = ts.transpileModule(source, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
  });

  const errors = (result.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) {
    const formatted = errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")).join("\n");
    throw new Error(`${path} has TypeScript syntax/transpile errors:\n${formatted}`);
  }
}

const webhook = readFileSync(drafts[0], "utf8");
assert.match(webhook, /verifyStripeSignature/);
assert.match(webhook, /apply_subscription_stripe_event/);
assert.match(webhook, /\/subscriptions\//);
assert.match(webhook, /STRIPE_TEST_KEY_PATTERN/);
assert.match(webhook, /charge\.dispute\.created/);
assert.match(webhook, /billing_location_evidence/);
assert.doesNotMatch(webhook, /sk_live_[A-Za-z0-9]/);
assert.doesNotMatch(webhook, /rk_live_[A-Za-z0-9]/);

const billing = readFileSync(drafts[1], "utf8");
assert.match(billing, /reserve_subscription_checkout/);
assert.match(billing, /Idempotency-Key/);
assert.match(billing, /gamesignal-checkout-/);
assert.match(billing, /expires_at/);
assert.match(billing, /integration_identifier/);
assert.match(billing, /STRIPE_API_VERSION = "2026-06-24\.dahlia"/);
assert.match(billing, /STRIPE_TEST_KEY_PATTERN/);
assert.match(billing, /stripe_price_id/);
assert.match(billing, /checkout_attempt_id/);
assert.match(billing, /LAUNCH_BILLING_COUNTRY = "PL"/);
assert.match(billing, /automatic_tax\[enabled\].*true/);
assert.match(billing, /metadata\[declared_billing_country\]/);
assert.match(billing, /subscription_data\[metadata\]\[declared_billing_country\]/);
assert.match(billing, /body\.billing_country !== LAUNCH_BILLING_COUNTRY/);
assert.match(billing, /Paid beta is currently available only for customers with a Polish billing address/);
const countryGatePosition = billing.indexOf("body.billing_country !== LAUNCH_BILLING_COUNTRY");
const checkoutReservationPosition = billing.lastIndexOf("const admin = serviceClient();");
assert.ok(countryGatePosition >= 0, "Poland-only billing country gate must exist.");
assert.ok(checkoutReservationPosition >= 0, "Checkout reservation call site must exist.");
assert.ok(countryGatePosition < checkoutReservationPosition, "Billing-country rejection must occur before Checkout reservation/Stripe creation.");
assert.doesNotMatch(billing, /sk_live_[A-Za-z0-9]/);
assert.doesNotMatch(billing, /rk_live_[A-Za-z0-9]/);

const deletion = readFileSync(drafts[2], "utf8");
assert.match(deletion, /billing_accounts/);
assert.match(deletion, /billing_archive_not_ready/);
assert.match(deletion, /billing_archive_not_synced/);
assert.match(deletion, /subscription\?\.stripe_subscription_id && subscription\.status !== "canceled"/);
assert.match(deletion, /service\.auth\.admin\.deleteUser\(user\.id\)/);
assert.match(deletion, /retained\.workspace_id !== null/);
assert.match(deletion, /!retained\.account_deleted_at/);
assert.match(deletion, /billing_records_retained_as_required/);
assert.doesNotMatch(deletion, /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']/);

const checkoutMigration = readFileSync(
  "supabase/migrations/20260814123300_prevent_duplicate_subscription_checkout.sql",
  "utf8",
);
assert.match(checkoutMigration, /unique index billing_checkout_attempts_one_active_workspace_idx/);
assert.match(checkoutMigration, /where status in \('creating', 'open'\)/);
assert.match(checkoutMigration, /for update/);
assert.match(checkoutMigration, /security invoker/);
assert.match(checkoutMigration, /grant execute[\s\S]*to service_role/);
assert.match(checkoutMigration, /revoke all[\s\S]*from public, anon, authenticated/);

console.log("Billing Edge Function drafts, account deletion and checkout reservation invariants passed.");
