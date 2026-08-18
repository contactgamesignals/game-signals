# GameSignal pre-LIVE checkpoint - resilient billing and KSeF client

Status: SAFE DRAFT / no production cutover.

## Production boundary remains unchanged

- Production `main` remains the source of truth and has not been merged with this readiness branch.
- Current work remains on `stripe-readiness-20260813` / draft PR #1.
- No new branch migration in this checkpoint has been applied to the production Supabase database.
- No new Edge Function in this checkpoint has been deployed to production Supabase.
- Stripe remains sandbox-only; KSeF production submission remains locked.

## Stripe webhook v8 draft

A completely separate, unused draft function now exists at `supabase/functions/stripe-webhook-v8-draft/index.ts`. The deployed `stripe-webhook` v7 is untouched.

The v8 draft is designed around these rules:

1. `checkout.session.completed` and async success link Stripe Customer/Subscription IDs to the workspace but do NOT grant the paid plan or become an authoritative subscription-status source.
2. `customer.subscription.*` is authoritative for paid entitlements. At webhook handling time the draft re-reads the current Subscription object from Stripe before updating GameSignal, so retry/out-of-order event payloads cannot restore stale entitlement state.
3. Subscription state is intended to use the branch-only `apply_subscription_stripe_event(...)` database ordering guard.
4. Existing invoice accounting snapshots, Credit Notes and refund-total behavior are preserved in the draft.
5. `charge.succeeded`, `charge.updated` and `charge.refunded` can populate privacy-minimal country evidence.
6. `charge.dispute.*` can populate a separate dispute ledger. A dispute does not automatically suspend access; it sets accounting/access-review flags until a business policy is approved.
7. Outgoing Stripe reads in the v8 draft require a Stripe TEST key and an explicitly configured API version.

Do not deploy the v8 draft until its compatible migrations, webhook event set and sandbox regression tests are ready as one package.

## Pure Stripe event parsers and regression tests

`supabase/functions/_shared/stripe-event-parsers.ts` contains pure parsers for:

- conservative subscription-status mapping,
- authoritative Subscription state,
- Checkout linkage-only state,
- charge country evidence,
- dispute records.

`scripts/check-stripe-event-parsers.ts` regression-tests:

- `unpaid`/`paused` -> local `past_due`,
- `incomplete_expired` -> local `canceled`,
- Checkout parser exposes no paid plan/status grant,
- location `match`, `mismatch`, `insufficient`,
- open and terminal dispute parsing.

The existing `npm run typecheck` now executes these regressions. No new GitHub workflow was required.

## Stripe dispute ledger

Branch-only migrations add `billing_dispute_records` and a separate dispute funds state.

The ledger records factual Stripe dispute state such as:

- dispute/charge/payment-intent IDs,
- status and reason,
- amount/currency,
- evidence deadline and submission state,
- refundable flag,
- `funds_state` (`unknown`, `withdrawn`, `reinstated`),
- accounting/access review flags.

It deliberately does not auto-cancel subscriptions or decide customer access.

## VIES evidence

`lib/vies/server.ts` implements a fixed-endpoint, server-only VIES REST client against the European Commission service.

Rules:

- target VAT IDs are normalized and checked only against supported VIES member-state prefixes,
- Greek `GR` is normalized to VIES `EL`,
- the result is evidence only and never automatically decides reverse charge,
- with no requester VAT-UE identity the evidence can record validity but may have no `requestIdentifier`,
- after the final seller has a VAT-UE identity, requester country + requester VAT ID can be included and a returned `requestIdentifier` is treated as stronger audit evidence.

A branch-only `billing_vies_evidence` migration stores `pending/valid/invalid/unavailable`, request ID/date, returned name/address and match evidence. VIES downtime must not cause a Stripe payment to disappear; unresolved EU Company evidence remains pending/review instead.

The VIES migration has not been applied to production.

## KSeF encryption

Two current Ministry of Finance reference clients (C# and Java) were checked. Both implement invoice encryption as:

- 256-bit AES key,
- 128-bit IV,
- AES-256-CBC,
- PKCS padding compatible with PKCS#7,
- ciphertext bytes only; IV is sent separately in session `EncryptionInfo`,
- session key encryption with RSA-OAEP SHA-256,
- SHA-256 hashes represented as Base64.

This is important because one prose sentence in the MF interactive-session documentation can be read as if the IV were prefixed to ciphertext, while both reference clients return ciphertext only. The branch implementation follows the two official client implementations and keeps the IV separate.

`lib/ksef/crypto-core.ts` contains the pure crypto primitives. `scripts/check-ksef-crypto.ts` runs an AES round-trip, block-size, SHA-256 metadata and encrypted-payload regression test. The test is executed by existing CI through `npm run typecheck`.

No taxpayer key, KSeF token or real invoice is used in these tests.

## KSeF request builders and hard-locked online-session client

`lib/ksef/request-builders.ts` creates validated request bodies matching the current MF reference models for:

- opening an FA(3) online session,
- sending an encrypted online invoice.

`scripts/check-ksef-request-builders.ts` regression-tests the exact FA(3) formCode/encryption structure, invoice hashes/sizes/content and validation failures. It is executed by existing CI.

`lib/ksef/online-session.ts` prepares:

- open online session,
- send encrypted invoice,
- get session status,
- get invoice status,
- get invoice UPO,
- close online session.

Every operation calls the existing `assertKsefSubmissionAllowed()` first. Current configuration remains disabled. Production additionally requires the separate production unlock phrase, so merely having this client code cannot submit a legal invoice.

## Still intentionally pending

- no merge to `main`,
- no production Supabase migrations,
- no v8 webhook deployment,
- no change to the live/sandbox Stripe webhook event subscription yet,
- no fresh Individual/Company Checkout regression after hardened billing-function deployment,
- no executable FA(3) XSD success yet,
- no authenticated KSeF TEST login/session/invoice submission yet,
- no VIES evidence persistence in production,
- no final seller decision,
- no VAT-UE/SME/OSS final launch setup,
- no Stripe LIVE.

## Next coherent packages

1. Finish CI/Preview verification for this checkpoint.
2. When an allowed sandbox deployment path is available, apply the compatible v8 test migrations + deploy webhook v8 as one sandbox package and subscribe the needed charge/dispute events.
3. Regression-test duplicate/out-of-order subscription events, renewed charges, refunds and a controlled dispute test if Stripe's test tooling permits it safely.
4. Run a fresh Individual Checkout and Company Checkout (including EU Company tax ID) through the hardened Stripe billing function.
5. Execute FA(3) against the pinned official MF XSD before any KSeF TEST submission.
6. Only after XSD success, authenticate the final seller in KSeF TEST and run open -> send -> status -> close -> UPO with test data.
7. Final seller/VAT-UE/EU-B2C/legal/Stripe-account review remains immediately before LIVE.
