-- Add provider-neutral billing identity so GameSignal can use a Merchant of Record
-- without deleting or rewriting historical Stripe billing evidence.

alter table public.subscriptions
  add column if not exists billing_provider text not null default 'stripe',
  add column if not exists billing_customer_id text,
  add column if not exists billing_subscription_id text,
  add column if not exists billing_price_id text,
  add column if not exists billing_period text,
  add column if not exists last_billing_event_id text,
  add column if not exists last_billing_event_at timestamptz;

alter table public.subscriptions
  drop constraint if exists subscriptions_billing_provider_check,
  drop constraint if exists subscriptions_billing_period_check;

alter table public.subscriptions
  add constraint subscriptions_billing_provider_check
    check (billing_provider in ('stripe', 'paddle')),
  add constraint subscriptions_billing_period_check
    check (billing_period is null or billing_period in ('monthly', 'yearly'));

-- Existing records remain Stripe-owned unless/until a separately verified Paddle
-- subscription event moves that workspace to Paddle.
update public.subscriptions
set billing_provider = 'stripe',
    billing_customer_id = coalesce(billing_customer_id, stripe_customer_id),
    billing_subscription_id = coalesce(billing_subscription_id, stripe_subscription_id)
where stripe_customer_id is not null or stripe_subscription_id is not null;

create unique index if not exists subscriptions_billing_customer_unique_idx
  on public.subscriptions (billing_provider, billing_customer_id)
  where billing_customer_id is not null;

create unique index if not exists subscriptions_billing_subscription_unique_idx
  on public.subscriptions (billing_provider, billing_subscription_id)
  where billing_subscription_id is not null;

alter table public.billing_checkout_consents
  add column if not exists billing_provider text not null default 'stripe',
  add column if not exists billing_checkout_id text;

alter table public.billing_checkout_consents
  drop constraint if exists billing_checkout_consents_provider_check;

alter table public.billing_checkout_consents
  add constraint billing_checkout_consents_provider_check
    check (billing_provider in ('stripe', 'paddle'));

update public.billing_checkout_consents
set billing_provider = 'stripe',
    billing_checkout_id = coalesce(billing_checkout_id, stripe_checkout_session_id)
where stripe_checkout_session_id is not null;

create unique index if not exists billing_checkout_consents_provider_checkout_unique_idx
  on public.billing_checkout_consents (billing_provider, billing_checkout_id)
  where billing_checkout_id is not null;

comment on column public.subscriptions.billing_provider is
  'Billing provider that owns the current external customer/subscription identity. Historical Stripe columns are retained for audit compatibility.';
comment on column public.subscriptions.billing_customer_id is
  'Provider-neutral external customer ID (Stripe customer or Paddle customer).';
comment on column public.subscriptions.billing_subscription_id is
  'Provider-neutral external subscription ID (Stripe subscription or Paddle subscription).';

create or replace function public.apply_subscription_paddle_event(
  p_workspace_id uuid,
  p_event_id text,
  p_event_occurred_at timestamptz,
  p_plan public.subscription_plan,
  p_status public.subscription_status,
  p_paddle_customer_id text,
  p_paddle_subscription_id text,
  p_paddle_price_id text,
  p_billing_period text,
  p_cancel_at_period_end boolean,
  p_current_period_end timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected integer;
begin
  if p_workspace_id is null or p_event_id is null or btrim(p_event_id) = '' or p_event_occurred_at is null then
    raise exception 'workspace_id, event_id and event_occurred_at are required.';
  end if;
  if p_plan = 'free' then
    raise exception 'Paddle paid subscription event cannot assign the free plan.';
  end if;
  if p_billing_period not in ('monthly', 'yearly') then
    raise exception 'billing_period must be monthly or yearly.';
  end if;

  update public.subscriptions s
  set billing_provider = 'paddle',
      billing_customer_id = coalesce(p_paddle_customer_id, s.billing_customer_id),
      billing_subscription_id = coalesce(p_paddle_subscription_id, s.billing_subscription_id),
      billing_price_id = coalesce(p_paddle_price_id, s.billing_price_id),
      billing_period = coalesce(p_billing_period, s.billing_period),
      plan = p_plan,
      status = p_status,
      cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
      current_period_end = p_current_period_end,
      tax_access_status = 'approved',
      tax_access_reason = 'paddle_merchant_of_record',
      last_billing_event_id = p_event_id,
      last_billing_event_at = p_event_occurred_at,
      updated_at = now()
  where s.workspace_id = p_workspace_id
    and (
      s.last_billing_event_at is null
      or p_event_occurred_at > s.last_billing_event_at
      or (p_event_occurred_at = s.last_billing_event_at and p_event_id = s.last_billing_event_id)
    );

  get diagnostics affected = row_count;
  return affected = 1;
end;
$$;

revoke all on function public.apply_subscription_paddle_event(
  uuid, text, timestamptz, public.subscription_plan, public.subscription_status,
  text, text, text, text, boolean, timestamptz
) from public, anon, authenticated;

grant execute on function public.apply_subscription_paddle_event(
  uuid, text, timestamptz, public.subscription_plan, public.subscription_status,
  text, text, text, text, boolean, timestamptz
) to service_role;
