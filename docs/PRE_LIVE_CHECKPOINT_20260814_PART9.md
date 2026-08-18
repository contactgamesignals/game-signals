# GameSignal pre-LIVE checkpoint - 14 Aug 2026, part 9

This is the current tax/billing checkpoint. Where earlier August checkpoints assumed that Lumino Games was VAT-exempt, **this document supersedes that assumption**. Official register checks on 14 August 2026 showed the working seller is an active Polish VAT taxpayer and a valid VAT-UE taxpayer.

## Source-of-truth / deployment safety

- `main` remains unchanged at the historical production-app baseline; the current work remains on `stripe-readiness-20260813` in draft PR #1.
- Stripe remains TEST/Sandbox only. Billing code still rejects LIVE secret keys.
- KSeF PRODUCTION remains hard-locked. No real seller invoice was submitted to KSeF PROD.
- No historical migration or retained financial record was deleted.

## Official seller verification - PASSED for current working seller

Working seller: `Lumino Games sp. z o.o.`

Verified on 2026-08-14:

- Polish VAT register: NIP `6762600090` = **Czynny / active VAT taxpayer**.
- VAT registration legal date returned by the official register: `2026-03-01`.
- VIES: `PL6762600090` = **valid VAT-UE number**.
- Current KRS address: `ul. Kazimierza Morawskiego 5/127, 30-102 Kraków`.

The old `Ujastek 1` address and the old draft `VAT exempt` model are no longer valid for the current working seller. `lib/company.ts`, seller profile, compliance routing and launch-readiness logic were updated accordingly.

The final seller decision (Lumino Games vs Lumino Tax) is still intentionally deferred until immediately before LIVE. If the seller changes, all register checks and tax configuration must be repeated for the new entity.

## Stripe Tax sandbox - ACTIVE and verified

Stripe Tax sandbox is now explicitly configured for the current active-VAT seller:

- head office: Poland / current KRS Kraków address,
- default tax behavior: `inclusive`,
- default tax code: `txcd_10103001` (SaaS - business use),
- Polish standard VAT registration recorded in Stripe Tax,
- Checkout uses `automatic_tax[enabled]=true`,
- checkout/subscription metadata says `seller_vat_status=active`.

Isolated Polish tax regression:

- advertised/gross Indie price: `24.50 PLN`,
- Stripe total charged/calculated: `24.50 PLN`,
- net: `19.92 PLN`,
- VAT: `4.58 PLN`,
- standard VAT rate: 23%,
- Automatic Tax status: complete.

Therefore enabling Polish VAT does **not** increase the customer-facing 24.50 PLN price to 30.14 PLN; VAT is extracted from the advertised inclusive amount.

## Cross-border tax negative tests

German B2C with the current Polish `standard` Stripe Tax registration produced:

- gross: 24.50 PLN,
- tax: 0,
- `taxability_reason = not_collecting`.

This proves EU consumer sales must remain blocked until the EUR 10,000 cross-border B2C threshold position and small-seller/origin-VAT vs destination-VAT/OSS route are explicitly approved/configured.

A separate German B2B reverse-charge sandbox simulation produced `taxability_reason = reverse_charge` with 0 VAT. This verifies the Stripe Tax engine behavior but does **not** replace transaction-level VIES evidence for a real EU business customer.

## Runtime billing versions

Current Supabase billing runtime:

- `stripe-webhook` v9,
- `stripe-billing` v13,
- `delete-account` v3.

Webhook v9 stores invoice retry state and handles payment-action/payment-attempt-required events in addition to invoice lifecycle, subscription lifecycle, location evidence, Credit Notes/refunds and disputes.

`stripe-billing` v13 uses the pinned Stripe API version `2026-06-24.dahlia`, remains test-key-only, uses Automatic Tax, and uses Customer Portal configuration v3 with public Terms and Privacy links.

## Failed payment recovery - PASSED

An isolated insufficient-funds sandbox subscription proved:

- charge failure,
- subscription -> `past_due`,
- invoice remains open,
- Stripe Smart Retries schedules a future `next_payment_attempt`,
- GameSignal receives the webhook events,
- the isolated test subscription is not linked to the real workspace.

Customer recovery UI on the branch provides:

- Hosted Invoice Page `Pay now` for the same outstanding invoice,
- Stripe Customer Portal `Update payment method`,
- retry attempt count,
- next automatic retry time,
- paid-feature lock while the subscription is delinquent,
- automatic restoration after successful payment.

Backend premium features were audited and fail closed unless the effective subscription status is `active` or `trialing`.

## Tax-access entitlement gate - DEPLOYED and tested

New forward-only database logic separates Stripe's raw state from GameSignal's effective entitlement state.

`subscriptions` now stores:

- `stripe_status_raw`,
- `tax_access_status` (`pending`, `approved`, `review`),
- `tax_access_reason`,
- `tax_access_subscription_id`.

New effective status `blocked_tax` is deliberately not treated as paid by existing feature gates.

Behavior:

1. A different/new Stripe Subscription ID resets tax access to `pending`.
2. Raw `active`/`trialing` + tax access other than `approved` => effective `blocked_tax`.
3. Invoice evidence is evaluated by a seller-side database trigger.
4. Polish positive-value invoice with positive VAT => `approved` and effective paid state restored.
5. Polish positive-value invoice without VAT => `review`.
6. Cross-border invoice => `review`.
7. Unknown location => `pending`.

Real-schema transaction tests used `BEGIN ... ROLLBACK` and left no test data:

- PL Company, 24.50 gross / 4.58 VAT -> `approved`, effective `active`.
- DE consumer -> `review`, effective `blocked_tax` despite raw Stripe `active`.
- after rollback, the existing real sandbox Studio row retained its original Stripe Subscription ID and remained `active + approved`.

This gate is the second safety layer even if a user tampers with the frontend or changes billing data in Stripe.

## Active-VAT FA(3) / KSeF - PASSED technically

A new additive generator `lib/ksef/fa3-active-vat.ts` was added; the old VAT-exempt generator is retained for historical/testing purposes and is no longer the active launch path.

Active domestic PL B2B FA(3):

- 23% VAT extracted from VAT-inclusive gross,
- `P_13_1` net,
- `P_14_1` VAT,
- `P_15` gross,
- `P_12 = 23`,
- no VAT-exemption legal basis.

Regression examples:

- 24.50 -> 19.92 net + 4.58 VAT,
- 64.50 -> 52.44 net + 12.06 VAT.

The active-VAT sample passes the pinned official Ministry of Finance FA(3) XSD in normal CI.

The KSeF preview endpoint now uses the active-VAT generator and refuses output if the generated FA(3) VAT does not equal the Stripe invoice ledger VAT amount.

### Full active-VAT KSeF TEST E2E - PASSED

One-time CI run #277 completed successfully using the pinned official Ministry of Finance C# client and .NET 10.

The anonymized active-VAT GameSignal FA(3) passed:

- TEST authentication,
- encryption,
- OnlineSession open,
- encrypted invoice send,
- async processing/status,
- session close,
- accepted invoice flow,
- UPO retrieval/validation.

Real Lumino seller NIP/name/address were hard-blocked from leaving the runner; the official TEST harness used synthetic/random TEST identity.

The one-time external KSeF TEST step was removed again from normal CI immediately after success. The reusable manual regression script remains in the repo.

## Customer Portal - verified

Portal configuration v3 is active in Stripe sandbox with:

- `https://game-signals.vercel.app/privacy`,
- `https://game-signals.vercel.app/terms`,
- invoice history,
- payment method updates,
- customer contact/address updates,
- plan changes,
- cancellation at period end.

## Current launch scope recommendation

The safest first paid public route is **Poland first**:

- PL Individual: 23% VAT inclusive,
- PL Company: 23% VAT inclusive + active-VAT FA(3)/KSeF document path,
- EU Company: keep blocked for automatic activation until the real transaction-level VIES evidence/approval path is finalized,
- EU Individual: blocked until EUR 10,000 threshold + small-seller/OSS route is decided,
- non-EU: blocked until destination/place-of-supply review.

The database tax-access gate already enforces this fail-closed entitlement policy. A separate PL-only checkout declaration/UI gate should still be added so unsupported foreign users are stopped before payment rather than paying and entering review.

## Remaining blockers before Stripe LIVE

1. Final seller decision: Lumino Games vs Lumino Tax; repeat VAT/VIES/KRS checks if changed.
2. Add/verify PL-only pre-Checkout UX/backend declaration for the first rollout.
3. Decide the EU B2C EUR 10,000 threshold position and small-seller vs OSS route before opening EU consumers.
4. Finalize automatic EU Company transaction-level VIES approval before opening that route.
5. Review target non-EU countries before opening them.
6. Reproduce the reviewed Tax registration/head-office/inclusive/SaaS configuration on the LIVE Stripe account.
7. Reproduce Smart Retries / Revenue Recovery settings on LIVE.
8. Complete Stripe LIVE business onboarding and confirm charges/payouts capabilities.
9. Enable Supabase Leaked Password Protection and re-run security advisors.
10. Final legal/accounting review and explicit human approval of seller, invoicing, KSeF production numbering/credentials and LIVE prices.
11. Only then remove the code-level TEST-key lock and perform a separately authorized Stripe LIVE cutover.
