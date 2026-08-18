# GameSignal pre-LIVE checkpoint - 14 Aug 2026, part 8

This checkpoint records the successfully executed sandbox billing-runtime cutover and failed-payment recovery verification. It does **not** authorize Stripe LIVE, KSeF PRODUCTION, or merge to `main`.

## Supabase billing schema bundle is deployed

The previously reviewed billing-readiness sequence was applied successfully to the current Supabase runtime, followed by one additional additive FK index reported by the post-DDL performance advisor.

The final deployed forward sequence includes:

1. Stripe subscription event-order guards,
2. billing location evidence,
3. dispute ledger + funds state,
4. VIES evidence ledger,
5. duplicate-Checkout reservation and frozen Stripe parameters,
6. service-role-only subscription/Checkout RPC hardening,
7. completed-Checkout synchronization grace,
8. durable seller-side `billing_accounts` retention,
9. archive trigger hardening,
10. covering indexes for billing foreign keys, including `billing_checkout_attempts.user_id`.

No retained accounting table, historical migration or production record was deleted.

## Post-migration verification

Verified on the actual Supabase runtime:

- migration history contains the new migrations once each;
- RLS is enabled on exposed billing/evidence tables;
- `billing_accounts` and `billing_checkout_attempts` are internal-only and browser roles have no direct table access;
- browser roles cannot write invoice, adjustment, consent, location, dispute or VIES evidence ledgers;
- billing/subscription RPCs are service-role only;
- every retained financial/evidence record has a durable `billing_account_id`;
- workspace/user deletion now detaches retained seller-side evidence with `SET NULL` instead of cascading it away;
- the existing GameSignal Studio sandbox subscription remained linked to the same workspace, Stripe Customer and Stripe Subscription;
- the Supabase performance advisor no longer reports unindexed billing foreign keys.

The two known security warnings remain unrelated to the new billing schema: `pg_net` in `public` and Supabase Auth Leaked Password Protection disabled.

## Billing Edge Functions are now live in sandbox runtime

The reviewed draft implementations were deployed under the existing customer-facing slugs:

- `stripe-webhook` -> v8,
- `stripe-billing` -> v11,
- `delete-account` -> v3.

Both Stripe-facing functions are still hard-locked to TEST credentials and pin outbound Stripe API calls to `2026-06-24.dahlia`. Stripe LIVE remains impossible through these versions by design.

Rollback material for the exact previous runtime versions was captured before deployment: webhook v7, billing v10 and delete-account v2.

## Stripe webhook event coverage

The existing sandbox webhook endpoint was expanded to match webhook v8. It now includes checkout/subscription/invoice events, Credit Notes/refunds, `charge.succeeded`, `charge.updated`, `charge.refunded`, and the full Stripe dispute lifecycle used by the new ledgers.

Webhook v8 processed the subsequent isolated failed-payment test events successfully with HTTP 200 responses.

## Delinquent-subscription entitlement behavior

The paid-access boundary was audited across the current product. Paid capabilities are effective only for `active`/`trialing` subscriptions. Delinquent states fall back to Free or are blocked:

- game-slot enforcement/reconciliation,
- YouTube paid cadence,
- Twitch paid cadence,
- Discord configuration and delivery,
- Publisher CSV export.

A delinquent customer therefore cannot keep paid functionality simply because the stored plan name is still Indie/Studio/Publisher.

## Customer payment recovery UI

A dedicated failed-payment recovery card was added to Settings.

For `past_due`/`incomplete` subscriptions the billing manager sees the latest own open Stripe invoice and can:

- **Pay now** through that invoice's Stripe Hosted Invoice Page,
- **Update payment method** through Stripe Customer Portal.

The ordinary new-subscription plan chooser is hidden while the current subscription needs payment recovery. This prevents the UI from encouraging creation of a second subscription. Server-side Checkout reservation rules independently block duplicate subscriptions as a second line of defense.

## Smart Retries verified with an isolated sandbox failure

A separate Stripe sandbox customer and subscription with no GameSignal workspace link was used to test an actual failed automatic charge. The test card attached successfully but its charge failed.

Observed result:

- subscription moved to `past_due`,
- invoice remained `open`,
- `amount_remaining` stayed outstanding,
- Stripe populated `next_payment_attempt`, proving the account's current Billing recovery configuration schedules an automatic retry,
- a Stripe Hosted Invoice Page URL was available for immediate manual payment.

The isolated test subscription was then canceled immediately with no proration/final invoice, so it cannot create further fake retry traffic. A post-test Supabase query confirmed GameSignal still has exactly the original Studio subscription row and it remains `active`.

## CI and Preview

The failed-payment recovery UI passed GitHub CI and the matching Vercel branch Preview reached READY. Production `main` was not deployed.

## Still fail-closed before real money

The remaining launch gates are now primarily LIVE-account/compliance rather than subscription mechanics:

- verify launch-date Lumino Games VAT/VAT-UE position and final PL/EU/non-EU transaction matrix from current official sources;
- finalize EU B2C SME/EX vs destination-VAT/OSS routing;
- determine the exact KSeF obligation and production invoice flow applicable at launch;
- add/verify renewal SCA (`invoice.payment_action_required`) recovery handling;
- verify Customer Portal legal/business-profile links and LIVE Revenue Recovery settings;
- enable Supabase Auth Leaked Password Protection if available for the current plan;
- provision/verify the Stripe LIVE account, LIVE products/prices/webhook/portal and LIVE secrets;
- remove the TEST-key gate only in an explicit reviewed LIVE cutover;
- merge/deploy production only after the above checks are green.
