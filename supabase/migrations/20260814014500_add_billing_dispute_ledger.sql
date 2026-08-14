-- Stripe card-dispute lifecycle ledger.
-- Additive only. Disputes are intentionally separate from credit notes/refunds
-- because a chargeback is a payment-network process with its own lifecycle.
-- This table does NOT automatically change subscription entitlements.

create table public.billing_dispute_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stripe_dispute_id text not null unique,
  stripe_charge_id text not null,
  stripe_payment_intent_id text,
  stripe_customer_id text,
  status text,
  reason text,
  currency text check (currency is null or char_length(currency) = 3),
  amount bigint,
  evidence_due_at timestamptz,
  evidence_past_due boolean,
  evidence_submission_count integer,
  is_charge_refundable boolean,
  livemode boolean not null default false,
  needs_accounting_review boolean not null default true,
  needs_access_review boolean not null default true,
  last_stripe_event_id text,
  dispute_created_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_dispute_records_workspace_created_idx
  on public.billing_dispute_records(workspace_id, dispute_created_at desc);

create index billing_dispute_records_charge_idx
  on public.billing_dispute_records(stripe_charge_id);

create index billing_dispute_records_customer_idx
  on public.billing_dispute_records(stripe_customer_id)
  where stripe_customer_id is not null;

create trigger billing_dispute_records_set_updated_at before update on public.billing_dispute_records
for each row execute function public.set_updated_at();

alter table public.billing_dispute_records enable row level security;

create policy "billing_dispute_records_select_manager"
on public.billing_dispute_records
for select
to authenticated
using (private.can_manage_workspace(workspace_id));

revoke all on public.billing_dispute_records from anon;
revoke insert, update, delete on public.billing_dispute_records from authenticated;
grant select on public.billing_dispute_records to authenticated;
grant select, insert, update, delete on public.billing_dispute_records to service_role;
