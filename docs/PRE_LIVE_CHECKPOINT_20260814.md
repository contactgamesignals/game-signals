# GameSignal pre-LIVE checkpoint — 14 August 2026

Status: SAFE DRAFT / Stripe sandbox / no production cutover.

## Safety boundary

- Production `main` remains unchanged at `9671f2f00cfab4eba541092ef281bec29d5970d4`.
- All current readiness work stays on `stripe-readiness-20260813` / draft PR #1.
- Stripe remains sandbox-only.
- KSeF production submission remains disabled.
- Final legal seller decision (Lumino Games vs Lumino Tax) is intentionally deferred to the explicit pre-LIVE review.

## Verified billing behavior

- Existing Studio sandbox subscription is active.
- A PLN 1.00 partial sandbox refund reached Stripe webhook handling and the accounting adjustment ledger.
- A separate 3DS sandbox test reached an authentication-required/incomplete state and was cancelled without touching the GameSignal workspace.
- Six intended recurring sandbox prices exist: Indie, Studio and Publisher, monthly and yearly, all in PLN.
- Stripe automatic tax is off and the sandbox prices have unspecified tax behavior.
- Active Customer Portal v2 supports customer detail updates, payment method updates, invoice history, plan changes and cancel-at-period-end.
- Subscription/invoice/Credit Note/refund webhook coverage is enabled.

## Stripe items that remain pre-LIVE gates

- Complete the final Stripe account business/onboarding requirements so the chosen LIVE account can accept charges and payouts.
- Configure Terms and Privacy links in the final Customer Portal.
- Run fresh Individual and Company Checkout tests after the hardened billing function can be deployed; historical Checkout sessions predate the current buyer flow and are not proof of required name/address/company-tax-ID collection.
- Keep Stripe-hosted Checkout and Stripe-managed 3DS. Do not collect raw card details in GameSignal.
- Dynamic eligible payment methods can remain enabled unless final launch testing reveals a product-specific reason to restrict them.

## Email promise

Stripe sandbox product descriptions currently mention email alerts. Production email delivery is intentionally disabled until the sender domain is verified. Before LIVE either:

1. verify the sender domain, regression-test delivery and enable the intended email job, or
2. remove email-alert claims from paid-plan marketing.

This is a launch gate, not a post-launch TODO.

## Seller switch readiness

- `lib/seller-profile.ts` is the working billing seller profile.
- Terms, Privacy and Withdrawal legal bodies already use centralized `COMPANY` values.
- Terms and Privacy metadata descriptions still name Lumino Games directly; update those during the final seller review if the operator changes.
- `lib/billing-compliance.ts` still contains one local seller-name constant. It must be switched to the active seller profile during the final seller cleanup; current tax-routing behavior itself does not depend on that display name.

## VAT / EU routing

- Working seller assumption: Polish VAT-exempt taxpayer, intending to remain VAT-exempt while eligible.
- Company selection is evidence only; it never automatically proves reverse-charge treatment.
- EU Company launch requires VAT-UE readiness plus customer/taxable-person verification evidence (VIES where applicable).
- EU Individual launch requires an explicit cross-border SME/EX vs destination-VAT/OSS route.
- Stripe automatic tax stays off until this route is intentionally changed and reviewed.

## KSeF / FA(3)

- KSeF configuration defaults to TEST and submission is disabled by default.
- Current FA(3) generator is deliberately limited to PL Company + PLN + VAT-exempt invoices and requires an explicit reviewed exemption legal basis.
- Sandbox KSeF preview rejects Stripe LIVE records and uses PREVIEW numbering only.
- Full executable XSD validation is still pending; field inspection is not treated as equivalent to passing the official schema.
- Official KSeF 2.0 flow and cryptographic requirements have been reviewed from the Ministry of Finance reference documentation: authentication, access token, encrypted interactive session, async status and UPO retrieval.
- No KSeF TEST or production invoice has been submitted by GameSignal yet.

## Launch-readiness gate

The branch contains a fail-closed administrative launch gate. Explicit readiness is required for:

- final legal seller,
- domestic VAT profile,
- VAT-UE / EU B2B,
- EU B2C route,
- VIES evidence,
- FA(3) validation,
- KSeF TEST lifecycle,
- final Stripe account onboarding,
- email launch promise,
- final Stripe LIVE review.

The owner/admin readiness API is protected; an unauthenticated Preview request was verified to return HTTP 401.

## Next safe sequence

1. Get a permitted path to deploy the hardened sandbox billing function and run fresh Individual + Company Checkout regression tests.
2. Run the FA(3) sample against the pinned official MF XSD and fix all schema errors before any KSeF TEST submission.
3. Implement and persist VIES verification evidence for EU Company transactions.
4. Build KSeF TEST authentication/encryption/session/status/UPO flow while keeping production locked.
5. Resolve VAT-UE and EU B2C SME/OSS launch setup.
6. Resolve email-domain marketing promise and Stripe account onboarding/legal links.
7. At the final pre-LIVE review, choose Lumino Games or Lumino Tax and update the seller-dependent configuration as one reviewed change.
8. Run the complete sandbox regression suite again before any real payment configuration is enabled.
