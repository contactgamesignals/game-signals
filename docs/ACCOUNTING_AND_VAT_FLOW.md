# GameSignal - accounting and VAT workflow

GameSignal's current working seller is Lumino Games sp. z o.o. This document describes the billing/accounting state after the 14 August 2026 official-register verification. It intentionally keeps transaction-level evidence separate from UI declarations and remains subject to the final seller decision immediately before LIVE.

## Verified seller status - 14 August 2026

Official checks performed before the tax-enabled sandbox rollout established that Lumino Games sp. z o.o. is currently:

- a **czynny / active Polish VAT taxpayer** (NIP `6762600090`),
- registered for VAT from `2026-03-01` according to the Polish VAT register response,
- a **valid VAT-UE taxpayer** in VIES (`PL6762600090`),
- registered at the current KRS address `ul. Kazimierza Morawskiego 5/127, 30-102 Kraków`.

These facts supersede the earlier draft assumption that the seller was VAT-exempt. Re-check the official VAT register, VIES and KRS immediately before the explicit Stripe LIVE cutover, particularly if the seller is changed to Lumino Tax.

## Core rule

`Individual / Company` is a billing/customer declaration, not an automatic VAT verdict.

GameSignal stores factual evidence first:
- buyer type selected before Checkout,
- billing country and billing address,
- legal/customer name,
- Stripe tax IDs and their verification status when present,
- invoice currency, net/tax/gross amounts in Stripe minor units,
- Stripe invoice/customer/subscription IDs,
- service period and invoice timestamps,
- checkout-consent evidence,
- neutral jurisdiction bucket: `pl`, `eu`, `non_eu`, `unknown`,
- privacy-minimal payment/billing country evidence,
- VIES evidence for EU Company review,
- durable seller-side financial records that survive product-account deletion.

The app may automate an approved route only when the required evidence exists. Unknown/cross-border cases fail closed to accounting/tax review instead of guessing.

## Current launch routing

### Poland (`pl`) - approved sandbox route

- Individual: domestic B2C with Polish VAT.
- Company: domestic B2B with Polish VAT and the current KSeF/document rules.
- Stripe Tax uses VAT-inclusive pricing so customer-facing prices remain the advertised totals.
- Current SaaS tax code: `txcd_10103001`.
- A paid Polish invoice must contain a positive Stripe VAT amount before GameSignal automatically approves paid entitlement access.
- The domestic active-VAT FA(3) generator uses 23% VAT and blocks document output if its VAT amount does not equal the Stripe ledger VAT amount.

### EU other than Poland (`eu`)

- Company: reverse-charge candidate only after customer business/tax evidence is verified. Seller VAT-UE is valid, but a Company checkbox alone is never enough. Retain VIES evidence and review the transaction-level place-of-supply route.
- Individual: **not open for LIVE yet**. Confirm the seller's qualifying cross-border B2C amount against the EUR 10,000 EU threshold and then explicitly choose/configure the small-seller/origin-VAT route or destination-VAT/OSS route.
- Current database entitlement gate sends cross-border invoices to `review`, so an `active` Stripe subscription alone cannot unlock paid GameSignal features.

### Outside the EU (`non_eu`)

- Individual and Company remain blocked for automatic LIVE activation until target-country indirect-tax/place-of-supply rules are approved.
- Keep country/address/business evidence; do not reuse EU assumptions.

### Unknown

- Never activate paid entitlement solely from Stripe subscription status while location/tax evidence is incomplete.

## Stripe Tax sandbox configuration

Current sandbox configuration is intentionally explicit:

- Stripe remains TEST/Sandbox; real charges are still locked in code.
- Tax Settings status is active.
- Head office: Poland, current KRS address in Kraków.
- Default tax behavior: `inclusive`.
- Default product tax code: `txcd_10103001` (SaaS - business use).
- Polish standard VAT registration is recorded in Stripe Tax.
- normal Checkout and integration-healthcheck Checkout use `automatic_tax[enabled]=true`.
- Company Checkout collects company name and supported tax IDs.
- card/payment credentials stay entirely at Stripe and are never copied to Supabase.

A direct isolated sandbox tax test proved that an Indie price of `24.50 PLN` remains `24.50 PLN` gross and is split by Stripe into `19.92 PLN` net + `4.58 PLN` VAT. A German consumer test under the current standard registration produced `not_collecting`, which is why EU B2C remains fail-closed until its threshold/OSS route is approved.

## Tax-access entitlement gate

`subscriptions` keeps Stripe's raw subscription status separately from effective GameSignal access.

For a newly linked paid subscription:

1. Stripe raw state may become `active`/`trialing`.
2. GameSignal resets tax access to `pending` for that Stripe Subscription ID.
3. Until invoice evidence is approved, effective subscription status becomes `blocked_tax`.
4. Existing entitlement systems treat `blocked_tax` as Free because only `active`/`trialing` unlock paid features.
5. A Polish paid invoice with positive VAT automatically changes tax access to `approved` and restores the raw active/trialing status.
6. Cross-border or inconsistent invoice evidence becomes `review` and remains blocked.

This is deliberately independent of webhook delivery order: tax approval is associated with the specific Stripe Subscription ID.

## Billing ledger

`public.billing_invoice_records` is the accounting snapshot table. Stripe invoice webhooks upsert one record per Stripe invoice, including net/tax/gross amounts and retry/recovery state.

The snapshot is retained separately from the mutable Stripe Customer profile. Historical billing evidence must not silently change when a customer later edits their Stripe profile.

Seller-side financial records are linked to durable `billing_accounts`; product workspace/account deletion detaches product references instead of cascade-deleting accounting evidence.

Owner/admin exports are accounting aids, not tax filings or KSeF documents.

## Checkout consent evidence

`public.billing_checkout_consents` is seller-side evidence of the checkout declarations. It records buyer type, plan, period, Terms/Privacy versions, recurring-billing acknowledgement and, for Individuals, the request to begin service immediately.

Browser users cannot directly write/delete seller-side evidence tables.

## Failed-payment recovery

Stripe Smart Retries is enabled in the sandbox account and was tested with an isolated insufficient-funds subscription. Stripe moved the subscription to `past_due`, kept the invoice open and scheduled a later automatic retry.

GameSignal additionally provides:
- Hosted Invoice Page **Pay now** for the same outstanding invoice,
- Customer Portal payment-method update,
- retry-attempt count and next-payment-attempt display when Stripe supplies them,
- fail-closed paid entitlements for `past_due`, `unpaid`, `incomplete`, `canceled` and tax-blocked states,
- automatic paid-access restoration after Stripe confirms payment and the tax-access gate is approved.

The LIVE Stripe account must reproduce the reviewed Revenue Recovery settings before launch.

## KSeF handoff

Stripe invoice PDFs are payment/billing documents and are not treated as a substitute for a Polish structured invoice where KSeF rules require one.

The current branch has separate FA(3) generators for historical/exemption testing and active-VAT domestic billing. The active launch path uses the active-VAT generator.

For domestic Polish Company invoices the active-VAT FA(3) path:
- derives 23% VAT from the customer-facing gross amount,
- emits net (`P_13_1`), VAT (`P_14_1`) and gross (`P_15`),
- uses line VAT rate `P_12=23`,
- does not emit a VAT-exemption legal basis,
- is validated against the pinned official MF FA(3) XSD,
- refuses preview generation if FA(3) VAT differs from Stripe invoice VAT.

KSeF PRODUCTION remains hard-locked. TEST technical auth/encryption/OnlineSession/UPO plumbing has been proven previously; the active-VAT FA(3) document receives its own TEST E2E regression before the production gate can be approved.

B2C KSeF handling follows the rules in force at invoice time; re-check current MF rules before LIVE.

## Refunds, disputes and retained evidence

Commercial policy: subscription fees are generally non-refundable and no credit is due for an unused part of a billing period, except where mandatory law or an explicit seller decision requires otherwise.

Accounting implementation nevertheless records actual refunds, Credit Notes and disputes/chargebacks. A restrictive refund policy never removes financial adjustments from the seller-side ledger.

## Remaining LIVE checklist

Before removing the test-key lock:
1. Make the final seller decision (Lumino Games vs Lumino Tax) and re-run VAT/VAT-UE/KRS verification for that seller.
2. Complete the active-VAT KSeF TEST E2E regression and approve production numbering/credentials.
3. Keep the first public billing rollout Poland-only unless/until the EU B2C threshold/OSS route is explicitly approved.
4. Approve and persist transaction-level VIES evidence before EU Company automatic activation is opened.
5. Review non-EU target countries before opening those routes.
6. Reproduce Stripe Tax head office, inclusive pricing, product tax code and required registrations on the LIVE Stripe account.
7. Reproduce Smart Retries/Revenue Recovery and Portal Terms/Privacy on LIVE.
8. Complete Stripe LIVE business onboarding, charges and payouts capability.
9. Enable Supabase Leaked Password Protection and re-run security advisors.
10. Run fresh LIVE-configured-but-not-charging preflight, then perform a separately authorized Stripe LIVE cutover.

## Official sources to re-check before launch

- Polish Ministry of Finance - VAT register / VAT rules: https://www.podatki.gov.pl/
- Polish Ministry of Finance - KSeF: https://ksef.podatki.gov.pl/
- European Commission - VIES: https://ec.europa.eu/taxation_customs/vies/
- European Commission - One Stop Shop: https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en
- Stripe Tax documentation: https://docs.stripe.com/tax
