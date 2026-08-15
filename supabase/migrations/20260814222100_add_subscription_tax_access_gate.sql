-- Keep Stripe's raw payment/subscription state separate from GameSignal's
-- effective entitlement state. A new paid subscription remains blocked until
-- its invoice/customer tax route is approved by the seller-side billing flow.

alter table public.subscriptions
  add column if not exists stripe_status_raw public.subscription_status,
  add column if not exists tax_access_status text not null default 'approved',
  add column if not exists tax_access_reason text,
  add column if not exists tax_access_subscription_id text;

alter table public.subscriptions
  drop constraint if exists subscriptions_tax_access_status_check;

alter table public.subscriptions
  add constraint subscriptions_tax_access_status_check
  check (tax_access_status in ('pending', 'approved', 'review'));

update public.subscriptions
set stripe_status_raw = status
where stripe_status_raw is null;

alter table public.subscriptions
  alter column stripe_status_raw set not null;

comment on column public.subscriptions.stripe_status_raw is
  'Latest authoritative Stripe subscription status before GameSignal tax-access gating.';
comment on column public.subscriptions.tax_access_status is
  'Seller-side entitlement tax gate: pending, approved, or review. Only approved can expose active/trialing paid entitlements.';
comment on column public.subscriptions.tax_access_subscription_id is
  'Stripe subscription ID for which the current tax-access decision was made. Prevents cross-event ordering from resetting an already approved invoice route.';

create or replace function public.apply_subscription_stripe_event(
  p_workspace_id uuid,
  p_event_id text,
  p_event_created_at timestamptz,
  p_plan public.subscription_plan default null,
  p_status public.subscription_status default null,
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null,
  p_cancel_at_period_end boolean default null,
  p_current_period_end timestamptz default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  if p_workspace_id is null or p_event_id is null or btrim(p_event_id) = '' or p_event_created_at is null then
    raise exception 'workspace_id, event_id and event_created_at are required.';
  end if;

  update public.subscriptions s
  set plan = coalesce(p_plan, s.plan),
      stripe_status_raw = coalesce(p_status, s.stripe_status_raw),
      tax_access_status = case
        when p_stripe_subscription_id is not null
          and p_stripe_subscription_id is distinct from s.stripe_subscription_id
          and p_stripe_subscription_id is distinct from s.tax_access_subscription_id
          then 'pending'
        else s.tax_access_status
      end,
      tax_access_reason = case
        when p_stripe_subscription_id is not null
          and p_stripe_subscription_id is distinct from s.stripe_subscription_id
          and p_stripe_subscription_id is distinct from s.tax_access_subscription_id
          then 'awaiting_invoice_tax_route'
        else s.tax_access_reason
      end,
      status = case
        when coalesce(p_status, s.stripe_status_raw) in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
          and (
            case
              when p_stripe_subscription_id is not null
                and p_stripe_subscription_id is distinct from s.stripe_subscription_id
                and p_stripe_subscription_id is distinct from s.tax_access_subscription_id
                then 'pending'
              else s.tax_access_status
            end
          ) <> 'approved'
          then 'blocked_tax'::public.subscription_status
        else coalesce(p_status, s.stripe_status_raw)
      end,
      stripe_customer_id = coalesce(p_stripe_customer_id, s.stripe_customer_id),
      stripe_subscription_id = coalesce(p_stripe_subscription_id, s.stripe_subscription_id),
      cancel_at_period_end = coalesce(p_cancel_at_period_end, s.cancel_at_period_end),
      current_period_end = coalesce(p_current_period_end, s.current_period_end),
      last_stripe_event_id = p_event_id,
      last_stripe_event_created_at = p_event_created_at,
      updated_at = now()
  where s.workspace_id = p_workspace_id
    and (
      s.last_stripe_event_created_at is null
      or p_event_created_at >= s.last_stripe_event_created_at
    );

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.apply_subscription_stripe_event(
  uuid, text, timestamptz, public.subscription_plan, public.subscription_status,
  text, text, boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.apply_subscription_stripe_event(
  uuid, text, timestamptz, public.subscription_plan, public.subscription_status,
  text, text, boolean, timestamptz
) to service_role;

create or replace function public.set_subscription_tax_access(
  p_workspace_id uuid,
  p_tax_access_status text,
  p_reason text,
  p_stripe_subscription_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  if p_workspace_id is null then
    raise exception 'workspace_id is required.';
  end if;
  if p_tax_access_status not in ('pending', 'approved', 'review') then
    raise exception 'Invalid tax access status.';
  end if;

  update public.subscriptions s
  set tax_access_status = p_tax_access_status,
      tax_access_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      tax_access_subscription_id = coalesce(p_stripe_subscription_id, s.tax_access_subscription_id),
      status = case
        when s.stripe_status_raw in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
          and p_tax_access_status <> 'approved'
          then 'blocked_tax'::public.subscription_status
        else s.stripe_status_raw
      end,
      updated_at = now()
  where s.workspace_id = p_workspace_id
    and (
      p_stripe_subscription_id is null
      or s.stripe_subscription_id is null
      or s.stripe_subscription_id = p_stripe_subscription_id
    );

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.set_subscription_tax_access(uuid, text, text, text)
from public, anon, authenticated;

grant execute on function public.set_subscription_tax_access(uuid, text, text, text)
to service_role;
