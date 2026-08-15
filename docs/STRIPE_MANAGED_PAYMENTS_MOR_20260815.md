# Stripe Managed Payments Merchant-of-Record readiness — 2026-08-15

## Recommendation

Stripe Managed Payments is the preferred Merchant-of-Record candidate for GameSignal before migrating the product to a different billing provider. It preserves the existing Stripe-hosted Checkout, Billing subscription objects, webhook lifecycle and Customer Portal architecture while moving eligible new customer transactions to Stripe/Link as Merchant of Record.

Paddle remains a tested fallback on draft PR #2. Do not merge or activate both paths at once.

## Why this fits GameSignal

GameSignal sells its own digital SaaS subscriptions. Managed Payments supports eligible digital goods/SaaS and Poland-based businesses. For an eligible Managed Payments transaction, Stripe/Link acts as the Merchant of Record and takes responsibility for transaction-level indirect tax collection/remittance, fraud/disputes and customer payment support within the Managed Payments service scope.

Lumino Games still has normal company accounting and tax obligations for its revenue/payouts from Stripe, and any sale/country outside Managed Payments scope must be handled under the applicable direct-seller rules. Managed Payments must not be described as eliminating all company tax/accounting responsibilities.

## Existing subscriptions are not converted

Managed Payments applies only to new subscriptions created through a Managed Payments-enabled Checkout Session. Existing direct Stripe subscriptions remain historical/direct Lumino Games transactions and keep their current accounting/KSeF evidence path.

## Readiness code in this branch

- new sandbox-only `stripe-managed-checkout` Edge Function;
- explicit `managed_payments[enabled]=true` Checkout parameter;
- request API version pinned to a Managed Payments-compatible Stripe version;
- test-key-only lock plus `STRIPE_MANAGED_PAYMENTS_ENABLED=false` default gate;
- product tax-code verification before creating Checkout;
- explicit `merchant_of_record=stripe_managed_payments` metadata on Checkout and subscription;
- additive MoR marker on checkout-consent and invoice-ledger records;
- invoice MoR is propagated from immutable checkout-consent evidence;
- Managed Payments invoices bypass the legacy direct-seller VAT entitlement gate;
- Managed Payments transactions are excluded from Lumino Games seller-document/KSeF queue;
- unknown MoR rows fail closed for review;
- the existing direct Stripe checkout, webhook, subscription lifecycle and Customer Portal remain untouched in this readiness branch.

## Required Stripe sandbox setup

1. Enable Managed Payments in Stripe Dashboard and accept the Managed Payments terms for the account. This is a Dashboard/account action and is not performed by this branch.
2. Assign the reviewed eligible SaaS tax code `txcd_10103001` to the three GameSignal sandbox products before a Managed Payments checkout test.
3. Apply the additive MoR migration.
4. Deploy the new `stripe-managed-checkout` Edge Function only in sandbox/test mode.
5. Set `STRIPE_MANAGED_PAYMENTS_ENABLED=true` only after steps 1-4.
6. Create a brand-new test subscription through this function. Do not try to convert the existing Studio sandbox subscription.
7. Verify Checkout, webhook subscription lifecycle, invoice MoR propagation, entitlement activation, Portal behavior, refund/dispute behavior and that no Lumino seller document is queued.
8. Only after sandbox verification should the user-facing Billing UI be switched from the direct checkout action to the Managed Payments checkout action.

## Product tax code

At the time of this readiness review, the three existing GameSignal sandbox products had `tax_code=null`. Stripe's eligible Managed Payments tax-code list includes `txcd_10103001` (Software as a service — business use), which matches GameSignal's current SaaS positioning. The sandbox products should be updated only after explicit review; no LIVE product mutation belongs in this branch.

## Payout/balance model

Customer funds settle into the Stripe account balance and are paid out under Stripe's payout configuration rather than needing to hit the bank account for every individual checkout. This should be described internally as a provider balance, not as a bank account or unrestricted on-demand wallet.

## Deployment discipline

This work uses GitHub CI only. Do not create a Vercel preview/production deployment for this branch while the current Vercel daily deployment quota is constrained. The scheduled production-site continuation remains a separate task.
