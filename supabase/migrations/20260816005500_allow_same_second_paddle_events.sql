-- Paddle can emit distinct subscription lifecycle events with the same occurred_at
-- timestamp. Accept equal timestamps just like the hardened Stripe event guard,
-- while still rejecting events that are strictly older than the last applied event.

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
      or p_event_occurred_at >= s.last_billing_event_at
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
