alter table public.billing_contract_confirmations
  drop constraint if exists billing_contract_confirmations_delivery_status_check;
alter table public.billing_contract_confirmations
  add constraint billing_contract_confirmations_delivery_status_check
  check (delivery_status in ('pending', 'sending', 'retryable', 'delivered', 'failed', 'needs_review'));

drop index if exists public.billing_contract_confirmations_pending_idx;
create index billing_contract_confirmations_pending_idx
  on public.billing_contract_confirmations(created_at)
  where delivery_status in ('pending', 'retryable') and delivery_attempts < 5;

create or replace function public.claim_billing_contract_confirmations_for_delivery(p_limit integer default 10)
returns setof public.billing_contract_confirmations
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  safe_limit integer;
begin
  safe_limit := greatest(1, least(coalesce(p_limit, 10), 25));
  return query
  with candidates as (
    select c.id
    from public.billing_contract_confirmations c
    where c.delivery_status in ('pending', 'retryable')
      and c.delivery_attempts < 5
    order by c.created_at asc, c.id asc
    for update skip locked
    limit safe_limit
  ), claimed as (
    update public.billing_contract_confirmations c
    set delivery_status = 'sending',
        delivery_attempts = c.delivery_attempts + 1,
        last_attempt_at = now(),
        last_error = null,
        updated_at = now()
    from candidates x
    where c.id = x.id
    returning c.*
  )
  select * from claimed;
end;
$$;

revoke all on function public.claim_billing_contract_confirmations_for_delivery(integer)
from public, anon, authenticated;
grant execute on function public.claim_billing_contract_confirmations_for_delivery(integer)
to service_role;

create or replace function public.transition_billing_contract_confirmation_delivery(
  p_confirmation_id uuid,
  p_expected_sha256 text,
  p_target_status text,
  p_provider_message_id text default null,
  p_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected integer;
  target text := lower(btrim(coalesce(p_target_status, '')));
begin
  if target not in ('delivered', 'retryable', 'failed', 'needs_review') then
    raise exception 'Unsupported contract-confirmation delivery transition.';
  end if;
  if target = 'delivered' and nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then
    raise exception 'Provider message ID is required for delivered contract confirmation.';
  end if;

  update public.billing_contract_confirmations c
  set delivery_status = case
        when target = 'retryable' and c.delivery_attempts >= 5 then 'failed'
        else target
      end,
      delivered_at = case when target = 'delivered' then now() else c.delivered_at end,
      provider_message_id = case when target = 'delivered' then btrim(p_provider_message_id) else c.provider_message_id end,
      last_error = case when target = 'delivered' then null else left(btrim(coalesce(p_error, 'Delivery failure.')), 4000) end,
      updated_at = now()
  where c.id = p_confirmation_id
    and c.delivery_status = 'sending'
    and c.confirmation_sha256 = lower(btrim(coalesce(p_expected_sha256, '')));

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.transition_billing_contract_confirmation_delivery(uuid, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.transition_billing_contract_confirmation_delivery(uuid, text, text, text, text)
to service_role;

comment on function public.claim_billing_contract_confirmations_for_delivery(integer) is
  'Service-role-only SKIP LOCKED claim. Only pending/retryable confirmations can be claimed.';
comment on function public.transition_billing_contract_confirmation_delivery(uuid, text, text, text, text) is
  'Service-role-only transition from sending to delivered/retryable/failed/needs_review, guarded by immutable confirmation hash.';
