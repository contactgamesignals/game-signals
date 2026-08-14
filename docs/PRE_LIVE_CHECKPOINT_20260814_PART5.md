# GameSignal pre-LIVE checkpoint — 14 Aug 2026, part 5

This checkpoint is intentionally explicit about the difference between code prepared on the draft branch and changes actually deployed to production.

## Production remains untouched

- `main` is still based on `9671f2f00cfab4eba541092ef281bec29d5970d4`.
- No new draft migrations in this PR have been applied to the live Supabase project.
- Active Stripe billing remains sandbox-only.
- Active Supabase Stripe functions have not been replaced by the v8/v11 drafts.
- No KSeF authenticated session or invoice submission has been performed.

## Duplicate-subscription protection prepared on the draft branch

The current production billing flow can theoretically race if two Checkout requests are opened concurrently for the same workspace. The draft now includes a fail-closed reservation model:

- `billing_checkout_attempts` with at most one active (`creating`/`open`) attempt per workspace,
- row-level serialization on the existing `subscriptions` row,
- a 35-minute reservation aligned with Stripe Checkout `expires_at`,
- frozen Price/Customer/email parameters for Stripe idempotent retries,
- one legal consent record linked to one Checkout attempt,
- Stripe `Idempotency-Key` derived from the attempt UUID,
- resume of an already-open Checkout instead of creating another one,
- recovery of a network-uncertain Checkout creation through the same idempotency key,
- blocking new Checkout while an existing non-canceled Stripe subscription is `active`, `trialing`, `past_due` or `incomplete`,
- automatic release of attempts after their Stripe-aligned expiry,
- a short fail-closed grace path for a Checkout that completed before its subscription webhook has synchronized locally,
- automatic completion of active Checkout attempts when the subscription becomes `active` or `trialing`.

All reservation/RPC paths are service-role-only and use `SECURITY INVOKER` in their final forward migration.

## Stripe webhook hardening prepared, not deployed

`stripe-webhook-v8-draft` remains separate from active v7. It prepares:

- webhook signature verification,
- authoritative re-read of the current Stripe Subscription before entitlement updates,
- event-ordering guard,
- invoice/Credit Note/refund ledger preservation,
- privacy-minimal charge location evidence,
- dispute/chargeback ledger handling.

The v8 draft still requires a pinned `STRIPE_API_VERSION` environment variable for its Stripe GET calls. The available Supabase connector cannot set a new Edge Function secret/env value, so v8 must NOT be deployed until this is resolved safely.

`stripe-billing-v11-draft` pins outgoing Stripe API calls to `2026-06-24.dahlia` and remains test-key-only.

## CI now protects the financial drafts

The normal PR CI runs:

- TypeScript application typecheck,
- Stripe event parser regression checks,
- KSeF crypto regression checks,
- KSeF request-builder regression checks,
- Edge Function draft syntax/safety invariants,
- billing migration security/lifecycle invariants,
- ESLint,
- production Next.js build.

## FA(3) schema validation is now genuinely green

The CI workflow now generates the current GameSignal FA(3) sample and validates it with `xmllint` against the pinned official Ministry of Finance FA(3) XSD and its base schemas.

CI run #212 passed the real official-XSD validation. This closes the previous technical `FA(3) XSD not yet executed` blocker.

This does NOT mean KSeF submission is approved. The remaining lifecycle must still be tested in KSeF TEST: authentication, encrypted online session, send, async status, close and UPO.

## KSeF TEST public connectivity verified

A one-time CI probe successfully verified against the real KSeF TEST API:

- `POST /auth/challenge`,
- `GET /security/public-key-certificates`,
- a currently valid `KsefTokenEncryption` key,
- a currently valid `SymmetricKeyEncryption` key.

The public probe was then removed from mandatory CI to avoid making normal GameSignal builds dependent on temporary KSeF availability. The reusable script remains at `scripts/probe-ksef-test-public.sh`.

## Still blocked before any LIVE cutover

- final legal seller decision (Lumino Games vs Lumino Tax),
- seller VAT/VAT-UE status and final EU B2B route,
- final EU B2C SME/EX vs destination-VAT/OSS route,
- VIES evidence lifecycle test,
- KSeF TEST authentication/send/status/UPO lifecycle,
- Stripe v8/v11 sandbox deployment + full buyer-flow regression,
- failed-payment recovery Dashboard settings review,
- dispute policy and sandbox regression,
- final pinned LIVE webhook API version,
- Stripe account LIVE onboarding and payouts/charges readiness,
- Supabase Leaked Password Protection,
- email sender-domain decision vs removal of email claims,
- Customer Portal Terms/Privacy links,
- final legal/tax/accounting review,
- explicit separate Stripe LIVE cutover.
