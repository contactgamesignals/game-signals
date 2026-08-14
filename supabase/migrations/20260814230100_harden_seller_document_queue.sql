-- Finalize seller-document queuing without hardcoding the legal operator in
-- trigger logic. The active seller can be switched in one internal profile row
-- immediately before LIVE, while every document keeps a full immutable seller
-- snapshot and its seller_profile_key.

create table if not exists public.billing_seller_profiles (
  profile_key text primary key,
  legal_name text not null,
  nip text not null,
  registered_address text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  vat_status text not null,
  vat_ue_status text not null,
  active boolean not null default false,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_seller_profiles_one_active_idx
on public.billing_seller_profiles((active))
where active is true;

alter table public.billing_seller_profiles enable row level security;
revoke all on public.billing_seller_profiles from anon, authenticated;
grant select, insert, update, delete on public.billing_seller_profiles to service_role;

insert into public.billing_seller_profiles (
  profile_key,
  legal_name,
  nip,
  registered_address,
  country_code,
  vat_status,
  vat_ue_status,
  active,
  effective_from
) values (
  'lumino_games_20260814',
  'Lumino Games sp. z o.o.',
  '6762600090',
  'ul. Kazimierza Morawskiego 5/127, 30-102 Kraków, Poland',
  'PL',
  'active',
  'valid',
  true,
  '2026-08-14T00:00:00Z'::timestamptz
)
on conflict (profile_key) do update set
  legal_name = excluded.legal_name,
  nip = excluded.nip,
  registered_address = excluded.registered_address,
  country_code = excluded.country_code,
  vat_status = excluded.vat_status,
  vat_ue_status = excluded.vat_ue_status,
  updated_at = now();

alter table public.billing_seller_documents
  add column if not exists seller_profile_key text references public.billing_seller_profiles(profile_key) on delete restrict;

update public.billing_seller_documents
set seller_profile_key = 'lumino_games_20260814'
where seller_profile_key is null;

alter table public.billing_seller_documents
  alter column seller_profile_key set not null;

create index if not exists billing_seller_documents_seller_profile_key_idx
on public.billing_seller_documents(seller_profile_key);

create or replace function private.queue_paid_polish_company_document()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  account_id uuid;
  lifecycle text;
  seller public.billing_seller_profiles%rowtype;
begin
  if new.workspace_id is null
    or new.buyer_type is distinct from 'company'
    or upper(coalesce(new.customer_country, '')) <> 'PL'
    or new.stripe_subscription_id is null
    or coalesce(new.stripe_status, '') <> 'paid'
    or coalesce(new.total_amount, 0) <= 0
    or new.currency is null
  then
    return new;
  end if;

  select * into seller
  from public.billing_seller_profiles
  where active is true
  order by effective_from desc
  limit 1;

  if not found then
    raise exception 'Exactly one active seller billing profile is required before seller-document queuing.';
  end if;

  if seller.country_code <> 'PL' or seller.vat_status <> 'active' then
    raise exception 'Active seller profile is not approved for the current Polish active-VAT document route.';
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
    seller_profile_key,
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
    seller.profile_key,
    seller.nip,
    seller.legal_name,
    seller.registered_address,
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

comment on table public.billing_seller_profiles is
  'Internal legal seller profiles for billing/document snapshots. Exactly one active profile is expected before document queuing.';
