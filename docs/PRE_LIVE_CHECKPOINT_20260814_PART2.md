# GameSignal pre-LIVE checkpoint — subscription state and KSeF routing

Status: SAFE DRAFT / no production cutover.

## Verified Stripe subscription behavior

- The existing paid Studio sandbox subscription uses Stripe `billing_mode.type = flexible`.
- Stripe automatic tax is disabled on that subscription.
- Card 3DS behavior remains `automatic`.
- No billing-mode migration is required for the existing sandbox subscription.
- Do not add an explicit billing-mode parameter merely to change behavior that is already correct; re-check the current Stripe API behavior when creating the final LIVE Checkout configuration.

## Failed-payment entitlement audit

GameSignal consistently treats only `active` and `trialing` as paid subscription states:

- database game-limit enforcement maps every other subscription status to Free and automatically pauses games above the Free limit,
- Discord management requires active/trialing Studio or Publisher,
- the internal Discord delivery worker independently re-checks active/trialing Studio or Publisher before every delivery,
- Publisher CSV export requires active/trialing Publisher,
- Twitch cadence maps an inactive subscription to the Free cadence,
- YouTube cadence maps an inactive subscription to the Free cadence.

Result: `past_due`, `unpaid`, `paused`, `incomplete`, `incomplete_expired` and cancelled states do not retain paid GameSignal entitlements. Stripe webhook status mapping intentionally folds unsupported local enum states into the conservative local states `past_due`, `canceled` or `incomplete`.

## Stripe webhook ordering risk found before LIVE

Current production webhook v7 verifies Stripe signatures and synchronizes subscription/invoice/adjustment state, but subscription entitlement writes do not yet persist an event-created timestamp. Stripe webhooks can be retried and are not guaranteed to arrive in creation order.

A branch-only forward migration now prepares:

- `subscriptions.last_stripe_event_id`,
- `subscriptions.last_stripe_event_created_at`,
- service-role-only `apply_subscription_stripe_event(...)` for rejecting strictly older subscription state updates.

A follow-up forward migration allows distinct legitimate events that share the same Stripe second-level timestamp. Neither migration has been applied to the production database.

Before merge/LIVE:

1. wire the branch Stripe webhook to the guarded RPC,
2. make `customer.subscription.*` the authoritative source for paid status/plan,
3. keep Checkout completion primarily as customer/subscription linkage and consent evidence rather than a competing authoritative lifecycle source,
4. regression-test duplicate and deliberately out-of-order test events,
5. only then apply the migration and deploy the webhook together as one reviewed change.

Do not merge the ordering migrations independently from the compatible webhook version.

## KSeF foreign-business routing clarified

Official 2026 KSeF guidance confirms that invoices issued under Polish invoicing rules can include invoices to foreign contractors. When a Polish seller's KSeF issuance obligation applies:

- Polish B2B buyer with NIP: structured invoice is received through KSeF,
- foreign business buyer: the seller can still have a KSeF issuance obligation, but the buyer receives the invoice outside KSeF in the agreed manner, with the required KSeF/QR marking,
- consumer invoices remain outside mandatory KSeF and can be issued in KSeF voluntarily.

`lib/ksef/delivery-routing.ts` records this distinction without deciding whether the seller currently qualifies for the temporary 2026 small-invoicing relief.

The temporary 2026 PLN 10,000 monthly invoiced-sales relief must never be inferred from GameSignal/Stripe records alone. Its applicability depends on the final seller's complete monthly sales documented by invoices, including activity outside GameSignal.

## Revenue recovery launch gate

The branch launch-readiness model now has an explicit Stripe Revenue Recovery gate. Before LIVE, review in Stripe Billing:

- Smart Retries,
- customer failed-payment emails,
- automatic card updates where available,
- the final subscription status/action after retries are exhausted.

No assumption is made that these Dashboard settings are already enabled because the connected Stripe API does not expose a reliable read for this account-level configuration.
