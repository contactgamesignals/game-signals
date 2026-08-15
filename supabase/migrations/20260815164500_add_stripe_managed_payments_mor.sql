-- Add explicit Merchant-of-Record routing for Stripe Managed Payments.
-- Existing Stripe transactions remain direct Lumino Games transactions. This
-- migration is additive and does not convert historical subscriptions.

alter table public.billing_checkout_consents
  add column if not exists merchant_of_record text not null default 'lumino_games';

alter table public.billing_checkout_consents
  drop constraint if exists billing_checkout_consents_merchant_of_record_check;

alter table public.billing_checkout_consents
  add constraint billing_checkout_consents_merchant_of_record_check
  check (merchant_of_record in ('lumino_games', 'stripe_managed_payments'));

alter table public.billing_invoice_records
  add column if not exists merchant_of_record text not null default 'unknown';

alter table public.billing_invoice_records
  drop constraint if exists billing_invoice_records_merchant_of_record_check;

alter table public.billing_invoice_records
  add constraint billing_invoice_records_merchant_of_record_check
  check (merchant_of_record in ('unknown', 'lumino_games', 'stripe_managed_payments'));

-- There have been no Managed Payments checkouts before this migration. Preserve
-- the historical direct-merchant meaning of the existing ledger explicitly.
update public.billing_invoice_records
set merchant_of_record = 'lumino_games'
where merchant_of_record = 'unknown';

create or replace function private.propagate_invoice_merchant_of_record()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  resolved_mor text;
begin
  if new.checkout_consent_id is null then
    return new;
  end if;

  select c.merchant_of_record into resolved_mor
  from public.billing_checkout_consents c
  where c.id = new.checkout_consent_id
    and c.workspace_id = new.workspace_id;

  new.merchant_of_record := coalesce(resolved_mor, 'unknown');
  return new;
end;
$$;

revoke all on function private.propagate_invoice_merchant_of_record()
from public, anon, authenticated;

drop trigger if exists propagate_invoice_merchant_of_record_before_write
on public.billing_invoice_records;

create trigger propagate_invoice_merchant_of_record_before_write
before insert or update of checkout_consent_id, workspace_id
on public.billing_invoice_records
for each row execute function private.propagate_invoice_merchant_of_record();

create or replace function private.apply_invoice_tax_access_gate()
returns trigger
language plpgsql
security invoker
set search_path = public, private, pg_temp
as $$
declare
  decision text;
  reason text;
begin
  if new.workspace_id is null or new.stripe_subscription_id is null then
    return new;
  end if;

  if new.merchant_of_record = 'stripe_managed_payments' then
    -- Stripe/Link is the Merchant of Record for this customer transaction. The
    -- legacy direct-seller VAT evidence gate must not block paid entitlement.
    decision := 'approved';
    reason := 'stripe_managed_payments_mor';
  elsif new.merchant_of_record is distinct from 'lumino_games' then
    decision := 'review';
    reason := 'merchant_of_record_unverified';
  elsif new.customer_country is null then
    decision := 'pending';
    reason := 'missing_customer_country';
  elsif upper(new.customer_country) = 'PL' then
    if coalesce(new.total_amount, 0) = 0 then
      decision := 'review';
      reason := 'pl_zero_total_manual_review';
    elsif coalesce(new.tax_amount, 0) > 0 then
      decision := 'approved';
      reason := 'pl_standard_vat_collected';
    else
      decision := 'review';
      reason := 'pl_vat_missing_on_paid_invoice';
    end if;
  else
    decision := 'review';
    reason := case
      when new.buyer_type = 'company' then 'cross_border_company_vies_tax_review'
      when new.buyer_type = 'individual' then 'cross_border_consumer_tax_route_not_live'
      else 'cross_border_unknown_buyer_tax_review'
    end;
  end if;

  perform public.set_subscription_tax_access(
    new.workspace_id,
    decision,
    reason,
    new.stripe_subscription_id
  );

  return new;
end;
$$;

revoke all on function private.apply_invoice_tax_access_gate()
from public, anon, authenticated;

drop trigger if exists apply_invoice_tax_access_gate_after_write
on public.billing_invoice_records;

create trigger apply_invoice_tax_access_gate_after_write
after insert or update of customer_country, tax_amount, total_amount, buyer_type, stripe_subscription_id, merchant_of_record, checkout_consent_id
on public.billing_invoice_records
for each row execute function private.apply_invoice_tax_access_gate();

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
  if new.merchant_of_record is distinct from 'lumino_games'
    or new.workspace_id is null
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
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.buyer_name
      else excluded.buyer_name
    end,
    buyer_country = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.buyer_country
      else excluded.buyer_country
    end,
    buyer_address = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.buyer_address
      else excluded.buyer_address
    end,
    buyer_tax_ids = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.buyer_tax_ids
      else excluded.buyer_tax_ids
    end,
    currency = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.currency
      else excluded.currency
    end,
    net_amount = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.net_amount
      else excluded.net_amount
    end,
    tax_amount = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.tax_amount
      else excluded.tax_amount
    end,
    gross_amount = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.gross_amount
      else excluded.gross_amount
    end,
    issue_date = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.issue_date
      else excluded.issue_date
    end,
    service_period_start = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.service_period_start
      else excluded.service_period_start
    end,
    service_period_end = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.service_period_end
      else excluded.service_period_end
    end,
    stripe_billing_reason = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.stripe_billing_reason
      else excluded.stripe_billing_reason
    end,
    lifecycle_status = case
      when public.billing_seller_documents.legal_document_number is not null then public.billing_seller_documents.lifecycle_status
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
after insert or update of workspace_id, billing_account_id, stripe_subscription_id, stripe_status, buyer_type, customer_name, customer_country, customer_address, customer_tax_ids, currency, tax_amount, total_amount, amount_paid, livemode, finalized_at, invoice_created_at, period_start, period_end, billing_reason, merchant_of_record, checkout_consent_id
on public.billing_invoice_records
for each row execute function private.queue_paid_polish_company_document();

comment on column public.billing_checkout_consents.merchant_of_record is
  'Expected merchant for this checkout. stripe_managed_payments means Stripe/Link is Merchant of Record for the customer transaction.';
comment on column public.billing_invoice_records.merchant_of_record is
  'Resolved merchant for the customer invoice transaction. Managed Payments rows are excluded from Lumino seller-document/KSeF issuance.';
