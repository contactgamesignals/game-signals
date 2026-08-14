-- Additive Stripe invoice recovery state used to explain failed-renewal recovery
-- to workspace billing managers. Stripe remains the source of truth for retry timing.

alter table public.billing_invoice_records
  add column if not exists attempt_count integer,
  add column if not exists next_payment_attempt timestamptz,
  add column if not exists collection_method text;

create index if not exists billing_invoice_records_recovery_idx
  on public.billing_invoice_records(workspace_id, next_payment_attempt)
  where stripe_status = 'open' and amount_remaining > 0;
