-- Durable seller-side document queue. This is additive and intentionally does
-- not submit anything to KSeF. Sandbox records can be prepared for preview but
-- the numbering RPC refuses to allocate a legal invoice number for TEST data.

create table if not exists public.billing_document_sequences (
  id uuid primary key default gen_random_uuid(),
  seller_nip text not null,
  sequence_year integer not null check (sequence_year between 2000 and 2200),
  series text not null check (series ~ '^[A-Z0-9_-]{1,16}$'),
  last_number bigint not null default 0 check (last_number >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_nip, sequence_year, series)
);

alter table public.billing_document_sequences enable row level security;
revoke all on public.billing_document_sequences from anon, authenticated;
grant select, insert, update, delete on public.billing_document_sequences to service_role;

create table if not exists public.billing_seller_documents (
  id uuid primary key default gen_random_uuid(),
  billing_account_id uuid not null references public.billing_accounts(id) on delete restrict,
  workspace_id uuid references public.workspaces(id) on delete set null,
  billing_invoice_record_id uuid not null references public.billing_invoice_records(id) on delete restrict,
  stripe_invoice_id text not null,
  source_livemode boolean not null,
  seller_nip text not null,
  seller_name text not null,
  seller_address text not null,
  buyer_type text not null,
  buyer_name text,
  buyer_country text,
  buyer_address jsonb,
  buyer_tax_ids jsonb not null default '[]'::jsonb,
  currency text not null,
  net_amount bigint not null check (net_amount >= 0),
  tax_amount bigint not null check (tax_amount >= 0),
  gross_amount bigint not null check (gross_amount >= 0),
  issue_date date,
  document_type text not null default 'invoice' check (document_type in ('invoice', 'correction')),
  lifecycle_status text not null check (lifecycle_status in (
    'sandbox_preview_ready',
    'ready_for_issue',
    'review',
    'ksef_pending',
    'ksef_accepted',
    'issued_outside_ksef',
    'failed'
  )),
  legal_document_number text,
  sequence_year integer,
  sequence_series text,
  sequence_number bigint,
  ksef_reference_number text,
  ksef_session_reference text,
  ksef_invoice_reference text,
  ksef_status_code integer,
  ksef_submitted_at timestamptz,
  ksef_accepted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_nip, stripe_invoice_id, document_type),
  check (gross_amount = net_amount + tax_amount),
  check (
    (legal_document_number is null and sequence_year is null and sequence_series is null and sequence_number is null)
    or
    (legal_document_number is not null and sequence_year is not null and sequence_series is not null and sequence_number is not null)
  )
);

create unique index if not exists billing_seller_documents_legal_number_idx
on public.billing_seller_documents(seller_nip, legal_document_number)
where legal_document_number is not null;

create index if not exists billing_seller_documents_workspace_id_idx
on public.billing_seller_documents(workspace_id)
where workspace_id is not null;

create index if not exists billing_seller_documents_billing_account_id_idx
on public.billing_seller_documents(billing_account_id);

create index if not exists billing_seller_documents_invoice_record_id_idx
on public.billing_seller_documents(billing_invoice_record_id);

create index if not exists billing_seller_documents_lifecycle_idx
on public.billing_seller_documents(lifecycle_status, created_at);

alter table public.billing_seller_documents enable row level security;
revoke all on public.billing_seller_documents from anon, authenticated;
grant select, insert, update, delete on public.billing_seller_documents to service_role;

create policy billing_seller_documents_select_manager
on public.billing_seller_documents
for select
to authenticated
using (
  workspace_id is not null
  and private.can_manage_workspace(workspace_id)
);

create or replace function public.reserve_seller_document_number(
  p_document_id uuid,
  p_series text default 'GS'
)
returns table (
  document_number text,
  sequence_year integer,
  sequence_number bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  doc public.billing_seller_documents%rowtype;
  normalized_series text;
  next_number bigint;
  target_year integer;
begin
  normalized_series := upper(btrim(coalesce(p_series, '')));
  if normalized_series !~ '^[A-Z0-9_-]{1,16}$' then
    raise exception 'Invalid invoice series.';
  end if;

  select * into doc
  from public.billing_seller_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'Seller document not found.';
  end if;
  if doc.source_livemode is not true then
    raise exception 'Legal invoice numbers cannot be allocated to Stripe sandbox documents.';
  end if;
  if doc.lifecycle_status <> 'ready_for_issue' then
    raise exception 'Seller document is not ready for legal issuance.';
  end if;
  if doc.legal_document_number is not null then
    return query select doc.legal_document_number, doc.sequence_year, doc.sequence_number;
    return;
  end if;

  target_year := extract(year from coalesce(doc.issue_date, current_date))::integer;

  insert into public.billing_document_sequences (seller_nip, sequence_year, series, last_number)
  values (doc.seller_nip, target_year, normalized_series, 1)
  on conflict (seller_nip, sequence_year, series)
  do update set
    last_number = public.billing_document_sequences.last_number + 1,
    updated_at = now()
  returning last_number into next_number;

  update public.billing_seller_documents
  set issue_date = coalesce(issue_date, current_date),
      sequence_year = target_year,
      sequence_series = normalized_series,
      sequence_number = next_number,
      legal_document_number = format('%s/%s/%s', normalized_series, target_year, lpad(next_number::text, 6, '0')),
      updated_at = now()
  where id = p_document_id
  returning billing_seller_documents.legal_document_number into doc.legal_document_number;

  return query select doc.legal_document_number, target_year, next_number;
end;
$$;

revoke all on function public.reserve_seller_document_number(uuid, text)
from public, anon, authenticated;
grant execute on function public.reserve_seller_document_number(uuid, text)
to service_role;

create or replace function private.queue_paid_polish_company_document()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  account_id uuid;
  lifecycle text;
  seller_nip constant text := '6762600090';
  seller_name constant text := 'Lumino Games sp. z o.o.';
  seller_address constant text := 'ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Poland';
begin
  if new.workspace_id is null
    or new.buyer_type <> 'company'
    or upper(coalesce(new.customer_country, '')) <> 'PL'
    or new.stripe_subscription_id is null
    or new.stripe_status <> 'paid'
    or coalesce(new.total_amount, 0) <= 0
  then
    return new;
  end if;

  select billing_account_id into account_id
  from public.billing_invoice_records
  where id = new.id;

  if account_id is null then
    raise exception 'Durable billing account is required before seller-document queuing.';
  end if;

  lifecycle := case
    when new.livemode is false then 'sandbox_preview_ready'
    when coalesce(new.tax_amount, 0) > 0 then 'ready_for_issue'
    else 'review'
  end;

  insert into public.billing_seller_documents (
    billing_account_id,
    workspace_id,
    billing_invoice_record_id,
    stripe_invoice_id,
    source_livemode,
    seller_nip,
    seller_name,
    seller_address,
    buyer_type,
    buyer_name,
    buyer_country,
    buyer_address,
    buyer_tax_ids,
    currency,
    net_amount,
    tax_amount,
    gross_amount,
    issue_date,
    lifecycle_status
  ) values (
    account_id,
    new.workspace_id,
    new.id,
    new.stripe_invoice_id,
    new.livemode,
    seller_nip,
    seller_name,
    seller_address,
    new.buyer_type,
    new.customer_name,
    upper(new.customer_country),
    new.customer_address,
    coalesce(new.customer_tax_ids, '[]'::jsonb),
    lower(new.currency),
    greatest(coalesce(new.total_amount, 0) - coalesce(new.tax_amount, 0), 0),
    coalesce(new.tax_amount, 0),
    coalesce(new.total_amount, 0),
    coalesce(new.invoice_created_at::date, current_date),
    lifecycle
  )
  on conflict (seller_nip, stripe_invoice_id, document_type)
  do update set
    workspace_id = excluded.workspace_id,
    buyer_name = excluded.buyer_name,
    buyer_country = excluded.buyer_country,
    buyer_address = excluded.buyer_address,
    buyer_tax_ids = excluded.buyer_tax_ids,
    currency = excluded.currency,
    net_amount = excluded.net_amount,
    tax_amount = excluded.tax_amount,
    gross_amount = excluded.gross_amount,
    lifecycle_status = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.lifecycle_status
      else excluded.lifecycle_status
    end,
    updated_at = now();

  return new;
end;
$$;

revoke all on function private.queue_paid_polish_company_document()
from public, anon, authenticated;

drop trigger if exists queue_paid_polish_company_document_after_write
on public.billing_invoice_records;

create trigger queue_paid_polish_company_document_after_write
after insert or update of stripe_status, customer_country, buyer_type, tax_amount, total_amount, amount_paid, billing_account_id
on public.billing_invoice_records
for each row execute function private.queue_paid_polish_company_document();

comment on table public.billing_seller_documents is
  'Durable seller-side invoice/correction queue. Stripe sandbox rows never receive legal document numbers.';
