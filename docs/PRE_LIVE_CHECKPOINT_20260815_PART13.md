# GameSignal pre-LIVE checkpoint — 2026-08-15 / Part 13

This checkpoint continues Part 12 and records completion of the shared fail-closed Stripe TEST/LIVE runtime integration across the future Stripe billing/webhook drafts. Nothing in this checkpoint authorizes or performs a LIVE deployment.

## Safety boundary

- Production `main` remains unchanged at `9671f2f00cfab4eba541092ef281bec29d5970d4`.
- Work remains isolated on `stripe-readiness-20260813` / draft PR #1.
- No merge to `main` was performed.
- No Stripe LIVE key/cutover was enabled.
- No KSeF PROD request, credential or legal-effect unlock was enabled.
- The currently deployed Supabase Stripe billing/webhook runtime was not replaced by the future drafts in this block.

## Shared Stripe runtime — one source of truth

The shared runtime is split into:

- `supabase/functions/_shared/stripe-runtime-mode-core.ts` — pure/testable TEST/LIVE classification and payload-mode checks;
- `supabase/functions/_shared/stripe-runtime-mode.ts` — Deno environment wrapper and Vault webhook-secret selection.

Runtime semantics:

- valid `sk_test_` / `rk_test_` => sandbox allowed;
- valid `sk_live_` / `rk_live_` without the exact global legal/billing-effect phrase => `live_locked`;
- LIVE is allowed only with:
  `GAMESIGNAL_STRIPE_LIVE_BILLING_UNLOCK=I_UNDERSTAND_STRIPE_LIVE_BILLING_CAN_CHARGE_REAL_CUSTOMERS`;
- missing/unknown secret formats fail closed;
- Stripe objects/lists can be checked so contradictory `livemode` evidence fails closed;
- TEST and LIVE webhook signing secrets are separate Vault secret names.

Behavioral regression: `scripts/check-stripe-runtime-mode.ts`.

## Future Stripe webhook v8 draft — integrated, NOT deployed

`supabase/functions/stripe-webhook-v8-draft/index.ts` now uses the shared runtime.

The existing accounting/event mapping was intentionally preserved. Runtime-boundary changes add:

- shared secret/mode selection;
- shared Stripe API version for authoritative re-reads;
- TEST/LIVE-specific webhook Vault secret selection;
- Stripe signature verification before parsing/processing;
- mandatory boolean `event.livemode` evidence;
- mandatory boolean `event.data.object.livemode` evidence;
- runtime/event/object mode agreement before subscription/invoice/Credit Note/refund/location/dispute mutations;
- authoritative Stripe subscription/charge re-reads checked against the same runtime;
- global LIVE lock failures return a service-unavailable path instead of mutating accounting state.

Dedicated regression: `scripts/check-stripe-webhook-runtime.ts`.
The regression verifies handler ordering:

1. signature verification;
2. verified event parsing;
3. event livemode check;
4. object livemode check;
5. only then billing/accounting dispatch.

The draft still identifies itself as `stripe-webhook-v8-draft` and has not been deployed.

## Future Stripe billing v11 draft — integrated, NOT deployed

`supabase/functions/stripe-billing-v11-draft/index.ts` now uses the same shared runtime.

Preserved without weakening:

- Poland-only paid-beta billing-country gate;
- workspace owner/admin billing authorization;
- duplicate/concurrent Checkout reservation protection;
- immutable/frozen Checkout attempt parameters;
- server-side Terms/Privacy/recurring billing consent evidence;
- immediate-service request for Individual purchases;
- Company name/address/Tax-ID collection;
- Stripe Tax automatic-tax flow;
- idempotency keys;
- existing subscription => Portal instead of duplicate Checkout;
- Customer Portal configuration and return flow.

Runtime-boundary changes add:

- shared TEST/LIVE secret classification;
- exact global LIVE billing unlock requirement;
- shared Stripe API version;
- Stripe API response `livemode` consistency checks where evidence is present;
- `status` reports runtime label without exposing secret material;
- billing management actions fail closed for missing/invalid/locked runtime;
- the destructive integration healthcheck remains deliberately sandbox-only even after future LIVE support exists, so it never creates/expires a LIVE Checkout Session as a health test.

Dedicated regression: `scripts/check-stripe-billing-runtime.ts`.

## Draft invariant coverage

`scripts/check-edge-function-drafts.ts` now requires both Stripe future drafts to use the shared runtime boundary rather than local test/live key parsing.

CI includes:

- KSeF state machine/auth/status/reconciliation/440 regressions;
- KSeF production inertness and behavioral production readiness;
- Stripe runtime behavioral regression;
- Stripe Tax-ID dual-lock regression;
- Stripe webhook runtime regression;
- Stripe billing runtime regression;
- operator-only launch-readiness regression;
- Edge Function draft transpile/invariants;
- official MF FA(3) XSD validation;
- isolated PostgreSQL retention regression;
- lint;
- production Next.js build.

## Deployed runtime distinction

Do not confuse branch readiness with deployment.

- `stripe-webhook-v8-draft` is not deployed;
- `stripe-billing-v11-draft` is not deployed;
- the branch version of the Tax-ID reconciler with future dual LIVE locks is also not the currently deployed version;
- current public paid launch remains disabled / sandbox-only.

No draft should be promoted merely because it is LIVE-capable behind locks. Promotion requires its own explicit pre-LIVE deployment/test step and later a separate LIVE-cutover authorization.

## Exact continuation point

Before any deployment:

1. Re-read current PR HEAD because this branch previously received delayed commits from an interrupted session.
2. Confirm the latest complete GitHub CI for Part 13 is green; if not, fix only the failing regression and do not deploy.
3. Compare the future draft functions against the currently deployed Supabase functions and prepare a sandbox-only deployment plan.
4. Deploy/test future versions in TEST/Sandbox only if explicitly appropriate, keeping all LIVE unlocks absent.
5. Re-run billing Checkout, Portal, invoice, refund/Credit Note, dispute, Tax-ID and webhook regressions against sandbox runtime.
6. Only after those results and final seller/KSeF/tax/legal checks should a separately authorized LIVE cutover even be considered.

## Remaining launch blockers

- final seller decision and fresh VAT/VIES/KRS verification immediately before LIVE;
- KSeF production token + fresh InvoiceWrite evidence + final seller confirmation + separate legal-effect arm;
- Stripe LIVE account onboarding/configuration/capabilities;
- explicit LIVE Tax-ID reconciler verification/approval;
- unresolved cross-border routes wherever still fail-closed;
- Supabase Leaked Password Protection;
- final legal/accounting review;
- separately authorized Stripe LIVE cutover.
