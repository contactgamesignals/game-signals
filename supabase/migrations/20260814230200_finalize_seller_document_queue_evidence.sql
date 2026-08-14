-- Final evidence hardening for the seller-document queue. A Polish Company
-- document can be ready for legal issuance only when the paid Stripe invoice
-- contains positive VAT plus a buyer name and a Polish-format tax identifier.

alter table public.billing_seller_documents
  add column if not exists service_period_start date,
  add column if not exists service_period_end date,
  add column if not exists stripe_billing_reason text;

create or replace function private.billing_has_polish_tax_id(p_tax_ids jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_tax_ids, '[]'::jsonb)) item
    where coalesce(item->>'type', '') in ('pl_nip', 'eu_vat')
      and regexp_replace(coalesce(item->>'value', ''), '[^0-9]', '', 'g') ~ '^[0-9]{10}$'
  );
$$;

revoke all on function private.billing_has_polish_tax_id(jsonb)
from public, anon, authenticated;

grant execute on function private.billing_has_polish_tax_id(jsonb)
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
  seller public.billing_seller_profiles%rowtype;
  buyer_evidence_ready boolean;
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

  buyer_evidence_ready :=
    new.customer_name is not null
    and btrim(new.customer_name) <> ''
    and private.billing_has_polish_tax_id(new.customer_tax_ids);

  lifecycle := case
    when new.livemode is false then 'sandbox_preview_ready'
    when coalesce(new.tax_amount, 0) > 0 and buyer_evidence_ready then 'ready_for_issue'
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
    service_period_start,
    service_period_end,
    stripe_billing_reason,
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
    coalesce(new.finalized_at::date, new.invoice_created_at::date, current_date),
    new.period_start::date,
    new.period_end::date,
    new.billing_reason,
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
    issue_date = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.issue_date
      else excluded.issue_date
    end,
    service_period_start = excluded.service_period_start,
    service_period_end = excluded.service_period_end,
    stripe_billing_reason = excluded.stripe_billing_reason,
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
