-- Additive follow-up for Stripe dispute accounting lifecycle.
-- Funds movement is separate from the dispute status itself.

alter table public.billing_dispute_records
  add column if not exists funds_state text not null default 'unknown'
    check (funds_state in ('unknown', 'withdrawn', 'reinstated')),
  add column if not exists last_funds_event_at timestamptz;
