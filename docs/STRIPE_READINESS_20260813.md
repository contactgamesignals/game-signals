# Stripe launch readiness — 2026-08-13

This file records the current verified billing state before any Stripe LIVE cutover.

## Verified today

- Stripe account used by GameSignal remains a sandbox account.
- Existing Studio monthly sandbox subscription is active.
- Existing sandbox card charge for 64.50 PLN succeeded with Visa test card ending 4242.
- Card details remain at Stripe; GameSignal stores no raw card data.
- A 1.00 PLN partial sandbox refund was executed against the existing Studio test payment.
- Stripe created refund `re_3U3bVq2W4uJ3nOpT1UXe0Ma6` successfully.
- The Stripe `charge.refunded` webhook reached the existing GameSignal webhook pipeline.
- `public.billing_adjustment_records` recorded the refund as `refund_total`, `partially_refunded`, amount `100` minor units, currency `pln`.
- The refund record is intentionally marked `needs_accounting_review=true` because a direct card refund is not automatically guessed to be a specific Polish accounting correction document.
- The GameSignal Studio test subscription remained active after the partial refund, as expected.

## Current policy

Stripe LIVE must stay disabled until the VAT/KSeF transaction matrix is approved. Hosted Stripe Checkout remains the payment UI; do not replace it with a custom raw-card form.

Before LIVE, Checkout should explicitly collect:
- required billing address for all paid buyers,
- required individual name for Individual purchases,
- required business name for Company purchases,
- supported company tax/VAT ID where applicable.

The production integration should also include an explicit server-side LIVE checkout gate so replacing a sandbox key cannot accidentally start real charges before the launch review is complete.

## Next sandbox tests

1. EU Company Checkout with business name + EU VAT ID.
2. EU Individual Checkout with billing location evidence.
3. 3DS-required card payment.
4. Declined card / failed payment path.
5. Credit Note flow and adjustment ledger verification.
6. Only after tax/KSeF approval: configure the live Stripe account, live products/prices, live webhook and portal, then explicitly unlock LIVE checkout.
