-- Follow-up to 20260814010000_guard_subscription_stripe_event_order.sql.
-- Stripe event.created has second-level precision, so multiple legitimate
-- events can share the same timestamp. Reject only strictly older events.
-- This is a forward-only function replacement; no data or schema is removed.

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
security definer
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
      status = coalesce(p_status, s.status),
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
