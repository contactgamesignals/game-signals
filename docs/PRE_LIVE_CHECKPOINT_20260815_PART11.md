# GameSignal pre-LIVE checkpoint — 2026-08-15 / Part 11

This checkpoint records the current safe-branch state after completing the durable PL Company seller-document pipeline, KSeF ambiguity handling and sandbox Stripe Tax ID reconciliation. It supersedes older VAT-exempt / old-address notes in historical checkpoint sections.

## Safety boundary

- Production `main` is unchanged at `9671f2f00cfab4eba541092ef281bec29d5970d4`.
- Work remains isolated on `stripe-readiness-20260813` / draft PR #1.
- Stripe remains TEST/Sandbox-only.
- No Stripe LIVE key/cutover has been enabled.
- KSeF PROD remains hard-locked; no production KSeF credentials or production invoice submission were enabled.
- No merge to `main` was performed.

## Current seller facts to use for this branch

Official checks on 2026-08-14 superseded older VAT-exempt assumptions:

- seller currently modeled for readiness work: Lumino Games sp. z o.o.;
- NIP: `6762600090`;
- active Polish VAT taxpayer;
- `PL6762600090` valid in VIES at the verification checkpoint;
- current KRS address: `ul. Kazimierza Morawskiego 5/127, 30-102 Kraków`.

Final seller selection remains deferred until immediately before LIVE. If the seller changes, seller identity, VAT/VIES/KRS evidence, production numbering and KSeF credentials must be re-verified before cutover.

## PL Company seller-document pipeline — completed on safe branch

Implemented and regression-tested:

- durable seller-document queue;
- seller-profile isolation;
- atomic/idempotent legal invoice numbering;
- sandbox documents cannot consume legal invoice numbers;
- PL Company queue requires positive domestic VAT evidence, company name and Polish Tax ID evidence;
- seller identity snapshot is locked after a legal number is reserved;
- exact FA(3) XML is frozen with SHA-256, size and generator metadata;
- PostgreSQL independently verifies the frozen FA(3) SHA-256;
- active-VAT domestic FA(3) passes the pinned official MF XSD;
- anonymized active-VAT FA(3) previously passed a full official KSeF TEST OnlineSession + UPO regression.

## KSeF state machine and issuance safety — completed on safe branch

The issuance path is persist-before-send and fail-closed:

1. start durable attempt;
2. open KSeF session;
3. persist session reference before invoice submission;
4. submit the immutable frozen FA(3);
5. persist invoice reference;
6. close session;
7. poll authoritative status;
8. persist acceptance + KSeF number + UPO.

Additional guarantees:

- failure before invoice POST can return to a retryable failure state only through the dedicated pre-submit transition;
- ambiguous failure after submission remains `ksef_pending` and is never blindly retried;
- existing pending sessions are reconciled without opening a new session or re-submitting the invoice;
- UPO SHA-256 is independently verified by PostgreSQL before acceptance is persisted;
- AES material is wiped on session/open error paths;
- importing the KSeF transport does not make a KSeF network call;
- KSeF PROD remains inert without the explicit production unlock and credentials.

## KSeF 440 duplicate reconciliation — completed and applied

A KSeF `440` response is no longer treated as a reason to re-submit.

The reconciliation path:

- preserves the duplicate attempt's own session/invoice references;
- reads `originalSessionReferenceNumber` and `originalKsefNumber` from the authoritative KSeF duplicate status;
- searches the original session for exactly one invoice matching both the legal invoice number and frozen FA(3) SHA-256;
- requires that matched original invoice to have authoritative status `200`;
- requires its KSeF number to equal `originalKsefNumber`;
- retrieves the original UPO and hashes it;
- atomically records the accepted original evidence through a service-role-only RPC;
- leaves the document pending/manual on any missing, ambiguous or contradictory evidence;
- never opens a new KSeF session and never re-submits the legal invoice from reconciliation.

Supabase runtime verification confirmed the duplicate-accept RPC is unavailable to `anon` / `authenticated`, available to `service_role`, requires `440 -> 200`, requires durable current-attempt references and independently verifies the UPO hash.

## Stripe Tax ID reconciliation for PL Company — deployed sandbox-only

Edge Function `reconcile-stripe-tax-ids` is ACTIVE and intentionally hard-locked to `sk_test_` credentials and `livemode=false` invoice records.

It:

- inspects only paid Polish Company sandbox invoices with a Stripe customer;
- fetches current Stripe customer Tax IDs;
- matches only the exact already-snapshotted Tax ID `type + value`;
- may enrich only `verification_status` for that exact snapshot;
- does not replace, invent or append a buyer Tax ID;
- causes the PL Company queue trigger to re-evaluate when the stored Tax ID verification evidence changes.

Verified runtime:

- manual authenticated cron-secret call returned HTTP 200 with `mode=stripe_sandbox_only` and no errors;
- cron `gamesignal-stripe-tax-id-every-5-minutes` is ACTIVE with schedule `*/5 * * * *`;
- first scheduled run succeeded;
- first scheduled worker response returned HTTP 200, `mode=stripe_sandbox_only`, `stripe_errors=0`;
- there were no current candidate invoices, so the worker changed no billing record.

## CI checkpoint

The safe branch passed the full CI after the KSeF 440 work and again after the Stripe Tax ID reconciler was added to CI.

Covered checks include:

- TypeScript;
- KSeF submission state machine;
- KSeF token authentication;
- KSeF status classification;
- deterministic pending-session reconciliation;
- KSeF 440 duplicate safeguards;
- seller snapshot lock;
- KSeF production inertness;
- Stripe Tax ID exact-snapshot / sandbox safeguards;
- issuance-orchestrator regression;
- official MF FA(3) XSD validation;
- isolated PostgreSQL regression;
- ESLint;
- production Next.js build.

Relevant successful CI run after Tax ID safeguards: GitHub Actions run #362.

## Supabase state and advisor review

Applied/verified runtime includes the seller queue, FA(3) freeze/hash guards, KSeF state machine, pre-submit transition, seller snapshot lock, KSeF duplicate evidence and Stripe Tax ID reconciliation trigger/cron.

Security Advisor after the latest DDL did not add a new warning from this work. Known items remain:

- `pg_net` in `public` — intentionally retained for the working scheduler path;
- Leaked Password Protection disabled — still a pre-LIVE Auth setting to enable;
- RLS-with-no-policy INFO on intentionally client-inaccessible billing tables.

Performance Advisor currently reports informational unused-index hints expected for the tiny beta dataset; no indexes are being removed at this stage.

Migration history currently contains two entries named `reconcile_stripe_tax_id_verification`. Runtime is not duplicated: there is one active cron job with the expected name and one queue trigger. Do not delete migration-history rows manually; only repair the ledger later through an officially safe migration-history workflow if necessary.

## PL Company KSeF launch policy for 2026

Official MF guidance checked again on 2026-08-15 confirms the temporary 2026 relief for taxpayers whose monthly gross sales documented by invoices subject to mandatory KSeF do not exceed PLN 10,000. Once the threshold is exceeded, the KSeF obligation starts from the invoice that exceeds the threshold and continues for subsequent invoices.

Official references:

- https://ksef.podatki.gov.pl/od-kiedy-trzeba-wystawiac-faktury-w-ksef/
- https://ksef.podatki.gov.pl/ponizej-10-000-zl/
- https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/zakres-obowiazkowego-ksef/
- https://ksef.podatki.gov.pl/wyjasnienia/co-warto-wiedziec-przed-startem-ii-etapu-wdrozenia-krajowego-systemu-e-faktur/
- https://ksef.podatki.gov.pl/ksef-news/najczestsze-pytania/

GameSignal launch policy is deliberately more conservative:

- the application will NOT automatically rely on the temporary PLN 10,000 transition;
- the threshold depends on seller-wide invoice activity, including sales outside GameSignal, which GameSignal cannot safely infer;
- PL Company LIVE therefore remains blocked until the production KSeF path for the final seller is explicitly prepared and authorized;
- using the temporary transition, if ever desired, must be a manual accounting/operator decision based on seller-wide evidence, not an application bypass.

`lib/billing-compliance.ts` now exposes this fail-closed policy as:

`require_ksef_prod_before_live_do_not_auto_use_2026_10k_transition`

This is routing/accounting policy only. It does not enable KSeF PROD or Stripe LIVE.

## Next blocking steps before paid LIVE

1. Final seller decision (Lumino Games vs another seller) and repeat VAT/VIES/KRS verification if the seller changes or immediately before LIVE.
2. Prepare production KSeF authorization/credentials and production numbering for that final seller; keep PROD locked until separately authorized.
3. Perform a controlled KSeF production-readiness review without submitting a production invoice prematurely.
4. Reproduce the already-reviewed Stripe Tax, Customer Portal and Revenue Recovery configuration in Stripe LIVE only after the document/tax prerequisites are approved.
5. Complete Stripe LIVE business onboarding, charges and payouts capability.
6. Enable Supabase Auth Leaked Password Protection and rerun Security Advisor.
7. Final legal/accounting review of Terms, Privacy, Withdrawal, checkout wording, VAT routing and invoice delivery.
8. Only then perform a separately authorized Stripe LIVE cutover.

Cross-border EU/non-EU consumer and business routes remain fail-closed wherever the transaction-level tax/evidence route has not yet been explicitly approved.
