-- Once a legal seller-document number is reserved, the accounting snapshot is
-- frozen at the queue layer as well. Later Stripe invoice webhook refreshes may
-- continue updating billing_invoice_records, but they must not silently rewrite
-- the buyer/amount/service evidence attached to an already numbered document.

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
    buyer_name = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.buyer_name
      else excluded.buyer_name
    end,
    buyer_country = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.buyer_country
      else excluded.buyer_country
    end,
    buyer_address = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.buyer_address
      else excluded.buyer_address
    end,
    buyer_tax_ids = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.buyer_tax_ids
      else excluded.buyer_tax_ids
    end,
    currency = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.currency
      else excluded.currency
    end,
    net_amount = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.net_amount
      else excluded.net_amount
    end,
    tax_amount = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.tax_amount
      else excluded.tax_amount
    end,
    gross_amount = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.gross_amount
      else excluded.gross_amount
    end,
    issue_date = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.issue_date
      else excluded.issue_date
    end,
    service_period_start = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.service_period_start
      else excluded.service_period_start
    end,
    service_period_end = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.service_period_end
      else excluded.service_period_end
    end,
    stripe_billing_reason = case
      when public.billing_seller_documents.legal_document_number is not null
        then public.billing_seller_documents.stripe_billing_reason
      else excluded.stripe_billing_reason
    end,
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

comment on function private.queue_paid_polish_company_document() is
  'Queues paid PL Company documents. After legal numbering, buyer/amount/service evidence is immutable in the seller-document ledger.';
