-- Freeze the Stripe parameters that must stay identical for an idempotent Checkout retry.
-- Forward-only additive follow-up to prevent_duplicate_subscription_checkout.

alter table public.billing_checkout_attempts
  add column if not exists stripe_lookup_key text,
  add column if not exists stripe_price_id text,
  add column if not exists stripe_customer_id_snapshot text,
  add column if not exists customer_email_snapshot text;

create index if not exists billing_checkout_attempts_customer_snapshot_idx
  on public.billing_checkout_attempts(stripe_customer_id_snapshot)
  where stripe_customer_id_snapshot is not null;
