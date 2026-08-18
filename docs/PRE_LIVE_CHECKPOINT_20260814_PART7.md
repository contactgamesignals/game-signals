# GameSignal pre-LIVE checkpoint - 14 Aug 2026, part 7

This checkpoint records the state immediately before any controlled Supabase/Stripe sandbox billing-bundle deployment. It does not authorize Stripe LIVE, KSeF PRODUCTION, final seller selection, or merge to `main`.

## Production remains untouched

- Production `main` remains based on `9671f2f00cfab4eba541092ef281bec29d5970d4`.
- Live Supabase migration history still ends at `20260813110545_add_billing_adjustment_ledger`.
- None of the 15 new billing-readiness migrations has been applied to the live Supabase project.
- Active billing functions remain `stripe-webhook` v7, `stripe-billing` v10 and `delete-account` v2.
- Stripe remains sandbox/test only.
- No Stripe LIVE or KSeF PRODUCTION call has been made.

## Financial-retention regression restored to green

A previous CI failure occurred before the financial SQL verification actually ran: the final output consisted only of Docker image pull/startup output and the harness returned exit code 2.

The CI harness was made deterministic without weakening SQL verification:

- `postgres:17-alpine` is pulled before the regression starts,
- a single retry is allowed only for harness exit code 2,
- SQL/migration errors remain fail-fast and are never hidden by the retry,
- compact diagnostics are emitted as GitHub annotations on failure.

CI run #241 then passed the isolated PostgreSQL 17 financial-retention cascade test together with FA(3), typecheck, lint and build. This confirms the retention migrations were not the cause of the transient red run.

## CI runtime updated

GitHub Actions was updated from the deprecated Node-20-based action releases to:

- `actions/checkout@v6`
- `actions/setup-node@v6`

The application test runtime remains Node 22. Automatic setup-node package-manager caching is explicitly disabled to avoid changing dependency-install semantics during this infrastructure-only update.

## Atomic sandbox deployment manifest

`docs/SANDBOX_BILLING_BUNDLE.md` now records the only approved order for the next billing sandbox cutover.

The live baseline is followed by exactly 15 forward migrations, from the Stripe event-order guard through billing evidence, duplicate-checkout reservation, seller-side financial retention and two additive covering indexes for existing billing foreign keys. The entire migration sequence must complete before any billing Edge Function is replaced.

The two final covering indexes address the current Supabase performance-advisor findings for `billing_checkout_consents.user_id` and `billing_invoice_records.checkout_consent_id`. Their migration contains no DROP, DELETE or TRUNCATE operation and changes no data or FK semantics.

After database verification, the function cutover is treated as one compatibility bundle:

- `stripe-webhook-v8-draft` -> `stripe-webhook`
- `stripe-billing-v11-draft` -> `stripe-billing`
- `delete-account-v3-draft` -> `delete-account`

No draft-name customer-facing endpoints should be deployed and no database objects should be deleted as rollback.

## Stripe API-version blocker resolved in code

Both billing v11 and webhook v8 now pin outgoing Stripe API reads/requests to the same reviewed sandbox API version:

`2026-06-24.dahlia`

Webhook v8 no longer requires a separate `STRIPE_API_VERSION` Supabase environment value. The change was made from the exact current GitHub blob and the resulting commit changed only the webhook-v8 draft file with a two-line addition / three-line removal delta.

This removes the connector/env-management blocker documented in part 6 without falling back to the Stripe account default API schema.

## Live-data preflight

Read-only checks against the current Supabase runtime found:

- 1 workspace and 1 subscription,
- zero duplicate non-null Stripe customer IDs,
- zero duplicate non-null Stripe subscription IDs,
- 1 invoice-ledger row and 1 adjustment-ledger row,
- zero invoice/adjustment rows pointing at a missing workspace.

The current financial workspace foreign keys still use `ON DELETE CASCADE`, which is the exact behavior the retention migration intentionally replaces with durable `billing_accounts` ownership plus nullable product links using `ON DELETE SET NULL`.

## Baseline advisors before any DDL

Security baseline:

- `pg_net` is installed in `public` (existing warning),
- Supabase Auth Leaked Password Protection is disabled (existing warning).

Performance baseline:

- two billing foreign keys lack covering indexes; the new final migration addresses them,
- remaining notices are unused-index INFO findings and are intentionally not acted on without workload evidence.

Advisors must be run again after any eventual migration bundle and compared to this baseline.

## Technical external TEST status remains green

Already verified before this checkpoint:

- current GameSignal FA(3) sample against the pinned official MF XSD,
- KSeF TEST public connectivity and current encryption keys,
- KSeF TEST XAdES authentication using TEST-only identity,
- full anonymized GameSignal FA(3) OnlineSession lifecycle through status, close and UPO using the official MF E2E harness,
- VIES official REST integration test for VALID and INVALID results,
- Stripe event parsers, KSeF crypto and request-builder regression suites.

These technical successes do not approve final production tax treatment or legal invoice content.

## Current next step

Do not apply a partial bundle.

After the current branch CI is green with the 15-migration manifest, the next controlled runtime step is either:

1. test the entire 15-migration + v8/v11/v3 bundle on a Supabase development branch, if a development branch is explicitly approved/created, or
2. apply the same bundle directly to the current sandbox-backed Supabase runtime only after an explicit pre-cutover verification of the live baseline and rollback versions.

There is currently no Supabase development branch. Creating one may have a cost and therefore requires the separate Supabase cost-confirmation flow before creation.

## Still fail-closed before LIVE

- final seller selection (`Lumino Games` vs `Lumino Tax`),
- final seller VAT/VAT-UE status,
- EU B2C SME/EX vs destination-VAT/OSS decision,
- production-grade VIES requester identity/evidence policy,
- failed-payment recovery settings review,
- dispute access/accounting policy,
- Stripe LIVE onboarding / charges / payouts readiness,
- Supabase Leaked Password Protection,
- verified email sender domain or removal of paid-plan email claims,
- Customer Portal Terms/Privacy links,
- final legal/tax/accounting review,
- explicit separate Stripe LIVE cutover.
