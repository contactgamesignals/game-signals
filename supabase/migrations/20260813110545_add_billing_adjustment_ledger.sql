create type public.billing_adjustment_type as enum ('credit_note', 'refund_total');

create table public.billing_adjustment_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  adjustment_type public.billing_adjustment_type not null,
  stripe_object_id text not null,
  stripe_invoice_id text,
  stripe_charge_id text,
  stripe_customer_id text,
  document_number text,
  status text,
  reason text,
  currency text check (currency is null or char_length(currency) = 3),
  amount bigint,
  pre_payment_amount bigint,
  post_payment_amount bigint,
  effective_at timestamptz,
  voided_at timestamptz,
  document_pdf text,
  livemode boolean not null default false,
  needs_accounting_review boolean not null default false,
  last_stripe_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (adjustment_type, stripe_object_id)
);

create index billing_adjustment_records_workspace_created_idx
  on public.billing_adjustment_records(workspace_id, created_at desc);

create trigger billing_adjustment_records_set_updated_at before update on public.billing_adjustment_records
for each row execute function public.set_updated_at();

alter table public.billing_adjustment_records enable row level security;

create policy "billing_adjustment_records_select_manager"
on public.billing_adjustment_records
for select
to authenticated
using (private.can_manage_workspace(workspace_id));

revoke all on public.billing_adjustment_records from anon;
revoke insert, update, delete on public.billing_adjustment_records from authenticated;
grant select on public.billing_adjustment_records to authenticated;
grant select, insert, update, delete on public.billing_adjustment_records to service_role;
