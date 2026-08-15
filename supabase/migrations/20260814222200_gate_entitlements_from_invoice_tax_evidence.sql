-- Convert seller-side Stripe invoice evidence into a conservative entitlement
-- decision. Initial LIVE rollout is Poland-first. Cross-border invoices are
-- retained and reviewed, but cannot silently activate paid product features.

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

  if new.customer_country is null then
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
after insert or update of customer_country, tax_amount, total_amount, buyer_type, stripe_subscription_id
on public.billing_invoice_records
for each row execute function private.apply_invoice_tax_access_gate();

comment on function private.apply_invoice_tax_access_gate() is
  'Poland-first fail-closed entitlement gate. Foreign billing evidence requires explicit tax review before paid access can become effective.';
