# Paddle Merchant-of-Record readiness — 2026-08-15

## Why this path

GameSignal currently has a working Stripe sandbox integration, but acting as the direct merchant creates avoidable end-customer indirect-tax, billing-document, fraud/chargeback and payment-operations work.

Paddle is being prepared as the preferred Merchant of Record (MoR) candidate. In this model Paddle is the merchant for the customer transaction, collects the customer payment and applicable indirect taxes, provides customer billing documents and manages much of the payment/compliance lifecycle. Lumino Games still has normal company accounting, corporate-tax and payout-reconciliation obligations for the amounts it receives from Paddle.

This branch does **not** activate Paddle or disable Stripe. It only makes the application provider-aware and keeps all Paddle checkout paths fail-closed until credentials, catalog IDs and explicit enable flags exist.

## Code prepared

- provider-neutral billing identity on `subscriptions` while retaining historical Stripe IDs;
- provider-neutral checkout linkage on `billing_checkout_consents`;
- ordered/idempotent `apply_subscription_paddle_event(...)` entitlement RPC;
- Paddle API billing Edge Function for status, recurring checkout transaction creation and Customer Portal sessions;
- Paddle webhook Edge Function with raw-body HMAC-SHA256 `Paddle-Signature` verification;
- authoritative plan/period mapping from configured Paddle price IDs;
- mismatch protection between Paddle price IDs and `custom_data`;
- Paddle checkout page at `/pay` using Paddle.js and `_ptxn` payment links;
- UI routing to the billing provider stored on an existing subscription, while free workspaces use the configured default provider;
- Stripe recovery/history remains available for existing Stripe subscriptions;
- Paddle LIVE is separately locked from sandbox enablement.

## Required Paddle setup before sandbox can run

1. Create a Paddle sandbox account.
2. Create one SaaS product (or an equivalent reviewed catalog structure) and six recurring prices for Indie/Studio/Publisher monthly + yearly.
3. Create a server API key with the minimum permissions needed for transactions and customer portal sessions.
4. Create a sandbox client-side token for Paddle.js.
5. Add `https://game-signals.vercel.app/pay` (or the current test domain) as the sandbox default payment link / approved checkout page.
6. Create a webhook notification destination for the future `paddle-webhook` Supabase function and store its endpoint secret as `PADDLE_WEBHOOK_SECRET`.
7. Configure the six `PADDLE_PRICE_*` IDs and keep `PADDLE_ENV=sandbox`.
8. Apply the additive provider-neutral migration, deploy `paddle-billing` and `paddle-webhook`, then set `PADDLE_BILLING_ENABLED=true` only for sandbox testing.
9. Set `GAMESIGNAL_BILLING_PROVIDER=paddle` only after the sandbox flow is verified end to end.

## LIVE remains locked

LIVE requires a separate Paddle live account/workspace and separate credentials/catalog. `PADDLE_LIVE_BILLING_ENABLED=true` is deliberately required in addition to the normal Paddle billing enable flag.

Before LIVE, update the public payment/merchant wording so it correctly names the Merchant of Record and verify the final payout/accounting treatment with the accountant. Do not reactivate GameSignal seller-issued KSeF logic for customer sales that are legally Paddle MoR transactions; retain the historical Stripe/KSeF records for audit purposes.

## Payout model

Paddle holds seller earnings as an account balance and pays out on its payout cycle rather than transferring each customer payment directly to the seller bank account. The provider balance is not a bank account and should not be described to users as an on-demand wallet.
