# GameSignal pre-LIVE checkpoint — 2026-08-15 / Part 14

This checkpoint continues Part 13 and records real Supabase/Stripe sandbox runtime verification of the shared fail-closed Stripe mode boundary. No production billing function was replaced and no LIVE mode was enabled.

## Safety boundary

- Production `main` remains unchanged at `9671f2f00cfab4eba541092ef281bec29d5970d4`.
- Work remains isolated on `stripe-readiness-20260813` / draft PR #1.
- No merge to `main` was performed.
- No Stripe LIVE key/cutover was enabled.
- No global Stripe LIVE billing unlock was enabled.
- No Tax-ID LIVE accounting unlock was enabled.
- No KSeF PROD credential/request/legal-effect unlock was enabled.
- Deployed `stripe-billing` and `stripe-webhook` production slugs were not replaced.

## CI gates

CI #403 passed after correcting the remaining legacy draft invariant for the shared billing runtime.

CI #406 passed with the complete runtime safeguard set including:

- shared Stripe TEST/LIVE behavioral core;
- Stripe billing-v11 runtime regression;
- Stripe webhook-v8 runtime regression;
- Stripe Tax-ID dual-lock regression;
- read-only Stripe runtime smoke invariant;
- KSeF readiness/reconciliation/inertness checks;
- official FA(3) XSD;
- PostgreSQL retention regression;
- lint;
- production Next.js build.

CI #409 passed after adding the signed webhook-runtime smoke endpoint and its mutation-free invariant.

## Real shared Stripe runtime smoke — deployed separately and verified

A new test-only Edge Function was deployed under the separate slug:

`stripe-runtime-smoke`

It does not replace `stripe-billing`, `stripe-webhook` or any customer-facing endpoint.

Security / behavior:

- custom `x-cron-secret` authentication;
- uses the exact shared `stripe-runtime-mode.ts` + pure core that future billing/webhook drafts use;
- refuses LIVE runtime;
- performs only `GET /v1/account` against Stripe;
- performs no Stripe billing mutation;
- performs no GameSignal billing/accounting DB write;
- does not return account ID or secret material.

Real invocation through the existing Vault-backed cron secret returned HTTP 200:

- `ok=true`;
- `mode=read_only_account_check`;
- `stripe_mode=sandbox`;
- `livemode=false`;
- Stripe API version `2026-06-24.dahlia`;
- `account_loaded=true`.

The connected Stripe app independently identifies the current account as `GameSignals sandbox`, confirming this environment is not the LIVE account.

## Existing deployed Stripe billing sandbox healthcheck — real runtime result

The currently deployed `stripe-billing` v14 integration healthcheck was run through the Vault-backed cron secret.

Result: HTTP 200 with:

- Stripe authenticated;
- API version `2026-06-24.dahlia`;
- sandbox mode;
- all 6 expected GameSignal recurring prices found;
- Company Checkout identity/Tax fields successfully created in TEST and the test Checkout Session immediately expired;
- Customer Portal configuration confirmed.

This verifies the existing sandbox business flow independently from the new shared runtime smoke.

## Signed webhook runtime boundary — deployed separately and verified

A second test-only Edge Function was deployed under:

`stripe-webhook-runtime-smoke`

It contains only the future webhook's security boundary:

1. shared Stripe runtime mode;
2. runtime-specific Vault webhook secret selection;
3. Stripe-style HMAC signature verification;
4. event `livemode` evidence;
5. object `livemode` evidence;
6. no billing/accounting mutation path.

Real tests were generated inside PostgreSQL using the existing test webhook secret from Vault. The secret never left Supabase.

### Correct TEST event

A correctly signed synthetic event with:

- event `livemode=false`;
- object `livemode=false`;

returned HTTP 200:

- `event_verified=true`;
- `stripe_mode=sandbox`;
- `livemode=false`;
- `mutation_performed=false`.

### Correct signature but wrong mode

A correctly signed synthetic event with `livemode=true` was rejected before any mutation with:

`Stripe event livemode does not match the configured Stripe runtime mode.`

The exact HTTP status is intentionally less important than the fail-closed rejection; no accounting path was reachable.

### Invalid signature

The same endpoint with an invalid signature returned HTTP 400:

`Invalid Stripe signature.`

### Ledger verification

The synthetic event IDs were searched across:

- `billing_invoice_records`;
- `billing_adjustment_records`;
- `billing_location_evidence`;
- `billing_dispute_records`.

All hit counts were zero.

Therefore the runtime/signature tests produced no financial-ledger mutation.

## Future Stripe Tax-ID reconciler — side-by-side deploy, cron untouched

The current deployed `reconcile-stripe-tax-ids` v3 still has its earlier local test/live mode logic.

The branch version using the shared global Stripe runtime plus the dedicated Tax-ID accounting-effect LIVE lock was deployed separately as:

`reconcile-stripe-tax-ids-next`

Important safeguards:

- current production cron still points to `reconcile-stripe-tax-ids`, not `-next`;
- `-next` requires internal authorization; an unauthenticated POST returned HTTP 401;
- database preflight found zero current paid PL Company sandbox invoices requiring Tax-ID verification refresh;
- a manual authenticated invocation of the potentially mutating `-next` worker was not forced when the tool safety layer refused to forward a Vault secret to that write-capable endpoint;
- that safety refusal was respected rather than bypassed.

Stripe's official API documentation confirms Customer Tax ID objects include a boolean `livemode` field, so the future worker's per-object runtime consistency guard is based on an actual Stripe contract.

## Supabase Leaked Password Protection

Current Supabase documentation confirms Leaked Password Protection is an Auth configuration setting exposed through Auth settings / Management API, not a Postgres SQL setting.

The connected Supabase toolset in this session does not expose a safe Auth-config PATCH action. Therefore this setting remains an explicit pre-LIVE manual/Management-API step; it was not faked through SQL.

## Test-only Edge Functions currently active

The following new test-only slugs exist for continued readiness verification:

- `stripe-runtime-smoke` — cron-secret protected, read-only;
- `stripe-webhook-runtime-smoke` — signed-webhook protected, mutation-free;
- `reconcile-stripe-tax-ids-next` — internal-auth protected, no cron attached.

Before final public LIVE launch, test-only endpoints should be reviewed and either removed/disabled or intentionally retained with documented purpose.

## Exact continuation point

The shared Stripe runtime boundary is now verified both statically and on the real Supabase/Stripe TEST environment.

Next work should no longer revisit the shared mode helper unless a regression appears. Continue with the remaining launch blockers:

1. inspect final Stripe LIVE account readiness/capabilities only when a LIVE account is intentionally connected;
2. keep all LIVE billing unlocks absent until separately authorized;
3. finish final-seller + fresh VAT/VIES/KRS confirmation near cutover;
4. provide production KSeF system token / `InvoiceWrite` evidence only when ready for a controlled PROD preflight;
5. enable Supabase Leaked Password Protection through Dashboard/Management API;
6. perform final legal/accounting review;
7. only then authorize Stripe LIVE cutover.
