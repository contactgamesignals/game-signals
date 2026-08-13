create table public.billing_invoice_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  checkout_consent_id uuid references public.billing_checkout_consents(id) on delete set null,
  stripe_invoice_id text not null unique,
  stripe_customer_id text,
  stripe_subscription_id text,
  buyer_type public.billing_buyer_type,
  stripe_status text,
  invoice_number text,
  billing_reason text,
  currency text check (currency is null or char_length(currency) = 3),
  subtotal_amount bigint,
  discount_amount bigint,
  tax_amount bigint,
  total_amount bigint,
  amount_paid bigint,
  amount_remaining bigint,
  customer_email text,
  customer_name text,
  customer_country text check (customer_country is null or char_length(customer_country) = 2),
  customer_address jsonb,
  customer_tax_ids jsonb not null default '[]'::jsonb,
  jurisdiction_bucket text not null default 'unknown' check (jurisdiction_bucket in ('pl', 'eu', 'non_eu', 'unknown')),
  invoice_created_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  finalized_at timestamptz,
  paid_at timestamptz,
  hosted_invoice_url text,
  invoice_pdf text,
  livemode boolean not null default false,
  last_stripe_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_invoice_records_workspace_created_idx
  on public.billing_invoice_records(workspace_id, invoice_created_at desc);

create trigger billing_invoice_records_set_updated_at before update on public.billing_invoice_records
for each row execute function public.set_updated_at();

alter table public.billing_invoice_records enable row level security;

create policy "billing_invoice_records_select_manager"
on public.billing_invoice_records
for select
to authenticated
using (private.can_manage_workspace(workspace_id));

revoke all on public.billing_invoice_records from anon;
revoke insert, update, delete on public.billing_invoice_records from authenticated;
grant select on public.billing_invoice_records to authenticated;
grant select, insert, update, delete on public.billing_invoice_records to service_role;
