# GameSignal pre-LIVE checkpoint — 2026-08-15 / Part 12

This checkpoint continues Part 11 and records the launch-gating work completed after the KSeF seller-document / Stripe Tax-ID runtime checkpoint.

## Safety boundary

- Production `main` remains unchanged at `9671f2f00cfab4eba541092ef281bec29d5970d4`.
- Work remains isolated on `stripe-readiness-20260813` / draft PR #1.
- Stripe runtime deployed in Supabase is still sandbox-only.
- No Stripe LIVE key/cutover was enabled.
- KSeF PROD remains hard-locked; no production KSeF request was performed.
- No merge to `main` was performed.

## KSeF production readiness gate — implemented, no network effect

A read-only KSeF production preflight now exists:

- `lib/ksef/production-readiness-core.ts` — pure/testable readiness logic;
- `lib/ksef/production-readiness.ts` — server-only wrapper that reads current seller/configuration without exposing secrets;
- `scripts/check-ksef-production-readiness.ts` — static + behavioral fail-closed regression.

The preflight requires, before KSeF can be considered production-ready:

- `KSEF_ENV=production`;
- active seller with valid Polish NIP;
- `KSEF_FINAL_SELLER_NIP` explicitly matching the reviewed active seller;
- fresh final-seller confirmation (<= 7 days);
- fresh active Polish VAT evidence (<= 7 days);
- fresh valid VAT-UE evidence (<= 7 days);
- server-only KSeF system token present;
- fresh verified `InvoiceWrite` permission evidence (<= 7 days).

The final legal-effect arm remains separate and requires:

- prerequisites ready;
- production environment;
- `KSEF_ENABLED=true`;
- exact existing production unlock phrase.

Behavioral tests prove:

- full prerequisites with no final arm => ready prerequisites but still locked;
- TEST environment cannot arm production even if generic booleans are true;
- missing token, wrong seller NIP or stale VAT/VAT-UE evidence fails closed.

The preflight performs no `fetch`, KSeF authentication, session opening or invoice submission.

## Central launch gate now consumes real KSeF readiness

`lib/launch-readiness.ts` now requires both:

1. explicit administrative KSeF flow approval + real KSeF prerequisites;
2. a separate `ksef_production_arm` check backed by `submissionArmed`.

Therefore `GAMESIGNAL_KSEF_FLOW_READY=true` alone cannot make GameSignal LIVE-ready.

## Global launch-readiness endpoint is operator-only

The internal route `app/api/accounting/launch-readiness/route.ts` no longer grants access based on a customer's workspace `owner/admin` role.

New fail-closed operator authorization:

- `lib/operator-access-core.ts` — pure explicit Supabase Auth UUID allowlist logic;
- `lib/operator-access.ts` — server-only wrapper using `GAMESIGNAL_OPERATOR_USER_IDS`;
- `scripts/check-operator-launch-readiness-access.ts` — behavioral + static regression.

Empty/malformed operator configuration rejects access. Customer workspace roles are intentionally insufficient for global seller/accounting launch state.

## Stripe global TEST/LIVE runtime helper

A shared fail-closed Stripe runtime helper now exists at:

`supabase/functions/_shared/stripe-runtime-mode.ts`

It distinguishes:

- test keys => TEST runtime;
- live keys without the exact global legal/billing-effect unlock => `live_locked`;
- live keys with exact `GAMESIGNAL_STRIPE_LIVE_BILLING_UNLOCK=I_UNDERSTAND_STRIPE_LIVE_BILLING_CAN_CHARGE_REAL_CUSTOMERS` => LIVE runtime allowed;
- unknown secret formats => rejected.

It also provides `assertStripePayloadMode(...)` so Stripe payload `livemode` evidence can be checked against the configured runtime.

This helper does NOT enable LIVE by itself.

## Stripe Tax-ID reconciler now shares the global runtime gate on the branch

Branch code for `reconcile-stripe-tax-ids` now uses the shared Stripe runtime helper rather than maintaining its own test/live key parser.

Future LIVE Tax-ID reconciliation therefore requires BOTH:

1. the global Stripe LIVE billing unlock;
2. the dedicated Tax-ID accounting-effect unlock:
   `GAMESIGNAL_STRIPE_LIVE_TAX_ID_RECONCILER_UNLOCK=I_UNDERSTAND_STRIPE_LIVE_TAX_ID_RECONCILIATION_HAS_ACCOUNTING_EFFECT`.

Additional guarantees:

- invoice query/update remains constrained to the runtime's exact `livemode`;
- Stripe Tax-ID responses are checked for runtime/livemode contradictions where Stripe exposes that evidence;
- matching remains exact existing Tax-ID `type + value`;
- worker may enrich verification status but may not invent/replace/add buyer Tax IDs.

Important runtime distinction: the currently deployed Supabase Tax-ID worker remains the earlier sandbox-only implementation. The branch's future LIVE-capable code has NOT been deployed.

CI run #387 passed after this shared-runtime Tax-ID integration.

## Stripe billing/webhook drafts — next coding block

Current candidate future deployment files are:

- `supabase/functions/stripe-billing-v11-draft/index.ts`;
- `supabase/functions/stripe-webhook-v8-draft/index.ts`.

They still contain their older local `STRIPE_TEST_KEY_PATTERN` sandbox gate. Their full PR patches were reviewed at this checkpoint.

The next implementation block is to wire the shared `stripe-runtime-mode.ts` into both drafts and regression-test that:

- a future live key cannot create Checkout/Portal/API mutations without the exact global LIVE unlock;
- webhook runtime must match the signed event/object `livemode` before any billing/accounting mutation;
- authoritative Stripe re-reads also match runtime;
- TEST behavior remains unchanged;
- no LIVE-capable draft is deployed until explicitly authorized later.

Do not bypass this by simply replacing `sk_test_` with `sk_live_`.

## Current launch blockers remain

- final seller decision immediately before LIVE and fresh VAT/VIES/KRS verification;
- production KSeF token/permission/seller evidence and explicit legal-effect arm;
- Stripe LIVE configuration/onboarding/capabilities and explicit cutover authorization;
- PL Company LIVE Tax-ID runtime verification before dedicated unlock;
- unresolved EU/non-EU routes remain fail-closed where required;
- Supabase Leaked Password Protection still needs enabling;
- final legal/accounting review.

## Exact continuation point

Continue from branch HEAD after CI #387. First re-read PR HEAD because this branch previously received delayed commits from the interrupted session. If stable, integrate the shared Stripe runtime helper into `stripe-billing-v11-draft` and `stripe-webhook-v8-draft`, test them in CI, and keep deployed runtime sandbox-only.
