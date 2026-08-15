# GameSignal sandbox billing deployment bundle

Status: **DRAFT ONLY — do not apply to production or merge to `main` yet.**

This document is the source of truth for the next controlled Supabase/Stripe sandbox deployment. The database migrations and Edge Function upgrades are treated as one compatibility bundle. Do not deploy only a later migration or only one new billing function.

## Current production baseline

At the time this manifest was prepared, the live Supabase project ends at migration:

- `20260813110545_add_billing_adjustment_ledger.sql`

Live billing functions remain:

- `stripe-webhook` v7
- `stripe-billing` v10
- `delete-account` v2

Stripe remains sandbox/test mode. No Stripe LIVE cutover is authorized by this document.

## Forward migrations — exact order

Apply all of the following in chronological order. Do not skip intermediate hardening migrations because later definitions intentionally replace or tighten earlier forward definitions.

1. `20260814010000_guard_subscription_stripe_event_order.sql`
2. `20260814010100_allow_same_second_stripe_events.sql`
3. `20260814013000_add_billing_location_evidence.sql`
4. `20260814014500_add_billing_dispute_ledger.sql`
5. `20260814014600_add_dispute_funds_state.sql`
6. `20260814015500_add_vies_evidence_ledger.sql`
7. `20260814123300_prevent_duplicate_subscription_checkout.sql`
8. `20260814124500_freeze_checkout_attempt_parameters.sql`
9. `20260814130000_harden_subscription_event_rpc_invoker.sql`
10. `20260814130500_reconcile_checkout_attempt_on_subscription.sql`
11. `20260814131500_harden_checkout_reservation_lifecycle.sql`
12. `20260814132000_return_recent_completed_checkout_attempt.sql`
13. `20260814140000_preserve_financial_records_after_account_deletion.sql`
14. `20260814140500_harden_billing_archive_internal_triggers.sql`
15. `20260814141000_add_billing_foreign_key_indexes.sql`

The final migration only adds covering indexes for two existing billing foreign keys reported by the Supabase performance advisor. It does not change data, foreign-key semantics or deletion behavior.

These are forward-only migrations. Historical migrations already applied to production must not be edited or replayed manually.

## Function bundle

After the entire migration sequence succeeds and schema/security verification is green, deploy the reviewed contents of the draft functions under the existing production slugs:

- `stripe-webhook-v8-draft` -> `stripe-webhook`
- `stripe-billing-v11-draft` -> `stripe-billing`
- `delete-account-v3-draft` -> `delete-account`

Do not deploy the draft directory names as parallel customer-facing endpoints.

`stripe-webhook` is a Stripe-signed webhook and therefore keeps custom signature authentication rather than Supabase JWT verification. `stripe-billing` and `delete-account` must retain their existing intended authentication model and server-side authorization checks.

## Stripe API version gate

Webhook v8 and billing v11 both pin outgoing Stripe API calls to the same reviewed sandbox version:

- `2026-06-24.dahlia`

Webhook v8 no longer depends on a separate `STRIPE_API_VERSION` environment value and does not fall back to the Stripe account default API schema. The webhook endpoint configuration in Stripe must still be reviewed against the same tested API version during the sandbox cutover.

## Database verification after migrations, before function cutover

Verify all of the following before replacing any live billing function:

- every migration appears exactly once in Supabase migration history;
- `billing_location_evidence`, `billing_dispute_records`, `billing_vies_evidence`, `billing_checkout_attempts`, and `billing_accounts` exist;
- RLS is enabled on exposed billing/evidence tables;
- authenticated/anon roles cannot insert/update/delete seller-side financial ledgers directly;
- reservation and subscription-event RPCs are executable only by the intended server role;
- no retained financial record is missing `billing_account_id` after backfill;
- the existing sandbox Studio subscription still resolves to its original workspace/billing account;
- the two pre-existing unindexed billing foreign-key advisor findings are resolved;
- Supabase security and performance advisors are re-run and any new warning is investigated before function cutover.

## Function verification immediately after cutover

Run sandbox-only health/regression checks before allowing a new Checkout:

- billing status endpoint works for an authenticated workspace manager;
- Stripe account authentication succeeds with a TEST key only;
- all six plan prices resolve by lookup key;
- Customer Portal session creation still works;
- integration healthcheck creates and expires a sandbox Checkout rather than charging anything;
- webhook rejects an invalid signature;
- current Stripe subscription state re-read succeeds on the pinned API version;
- old paid Studio sandbox subscription remains `active` and keeps its correct plan/limits.

If any item fails, stop the buyer-flow test and restore the previous function version before creating new sandbox transactions. Do not roll back database migrations by deleting schema objects; use a forward fix or Supabase branch reset only in an isolated development branch.

## Fresh Stripe sandbox regression

Only after the database and function checks above are green:

1. Individual monthly Checkout.
2. Company monthly Checkout with business name/address collection.
3. EU Company Checkout with a supported VAT/tax ID path.
4. EU Individual Checkout.
5. Two concurrent/repeated Checkout requests for one workspace: only one active Stripe Checkout/subscription path may survive.
6. Completed-Checkout/webhook synchronization grace path.
7. `past_due` / `unpaid` / `incomplete` entitlement behavior: effective paid features must fail closed to Free behavior except where a deliberately approved grace policy says otherwise.
8. Renewal/invoice lifecycle synchronization.
9. Credit Note and refund ledger synchronization.
10. Location evidence `match` / `mismatch` / `insufficient` behavior without automatic VAT decisions.
11. Dispute lifecycle if Stripe provides a safe sandbox fixture; otherwise keep the launch gate pending rather than inventing a fake success.
12. Account deletion test: product workspace/auth data may be deleted only after the existing guards allow it, while seller-side financial/accounting evidence remains retained and detached from deleted product rows.

## External compliance gates that remain separate

Technical success of this bundle does not decide or approve:

- final seller (`Lumino Games` vs `Lumino Tax`);
- seller VAT/VAT-UE registration state;
- EU B2C SME/EX vs destination VAT/OSS route;
- reverse-charge eligibility for an individual EU Company transaction;
- legal invoice numbering or production KSeF credentials;
- Stripe LIVE account onboarding;
- consumer-law/legal review.

Those remain fail-closed launch-readiness items immediately before the explicit LIVE cutover.

## Rollback principle

Before a function cutover, record the currently active Supabase function versions. If the new Edge Function fails the sandbox regression, restore the previous function code/version while keeping the database schema forward-compatible. Never delete retained financial evidence or historical migrations as a rollback mechanism.
