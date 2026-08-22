alter table public.subscriptions
  add column if not exists pending_plan public.subscription_plan,
  add column if not exists pending_plan_effective_at timestamptz,
  add column if not exists pending_plan_requested_at timestamptz;

alter table public.subscriptions
  drop constraint if exists subscriptions_pending_plan_state_check;

alter table public.subscriptions
  add constraint subscriptions_pending_plan_state_check check (
    (pending_plan is null and pending_plan_effective_at is null and pending_plan_requested_at is null)
    or
    (pending_plan is not null and pending_plan <> 'free'::public.subscription_plan and pending_plan_effective_at is not null and pending_plan_requested_at is not null)
  );

comment on column public.subscriptions.pending_plan is
  'Paid plan scheduled by Who Plays My Game to become the app entitlement after the next successful Paddle renewal.';
comment on column public.subscriptions.pending_plan_effective_at is
  'Renewal boundary at which a pending plan may become active after Paddle confirms the renewed subscription period.';

create or replace function public.enforce_workspace_game_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_plan public.subscription_plan;
  pending_plan_value public.subscription_plan;
  current_count integer;
  allowed_count integer;
begin
  if not new.enabled then
    return new;
  end if;

  perform 1
  from public.workspaces
  where id = new.workspace_id
  for update;

  select case
           when s.status in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
             then coalesce(s.plan, 'free'::public.subscription_plan)
           else 'free'::public.subscription_plan
         end,
         case
           when s.status in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
             then s.pending_plan
           else null
         end
    into current_plan, pending_plan_value
  from public.workspaces w
  left join public.subscriptions s on s.workspace_id = w.id
  where w.id = new.workspace_id;

  if current_plan is null then
    current_plan := 'free'::public.subscription_plan;
  end if;

  allowed_count := public.game_limit_for_plan(current_plan);
  if pending_plan_value is not null then
    allowed_count := least(allowed_count, public.game_limit_for_plan(pending_plan_value));
  end if;

  select count(*)::integer
    into current_count
  from public.games g
  where g.workspace_id = new.workspace_id
    and g.enabled = true
    and (tg_op = 'INSERT' or g.id <> new.id);

  if current_count >= allowed_count then
    raise exception 'Active game limit reached (% games).', allowed_count
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

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
      plan = case
        when s.pending_plan is not null and s.pending_plan = p_plan then
          case
            when p_status = 'active'::public.subscription_status
              and p_current_period_end is not null
              and s.pending_plan_effective_at is not null
              and p_current_period_end > s.pending_plan_effective_at
              then p_plan
            else s.plan
          end
        else p_plan
      end,
      status = p_status,
      cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
      current_period_end = p_current_period_end,
      pending_plan = case
        when s.pending_plan is null then null
        when p_status = 'canceled'::public.subscription_status then null
        when s.pending_plan <> p_plan then null
        when p_status = 'active'::public.subscription_status
          and p_current_period_end is not null
          and s.pending_plan_effective_at is not null
          and p_current_period_end > s.pending_plan_effective_at then null
        else s.pending_plan
      end,
      pending_plan_effective_at = case
        when s.pending_plan is null then null
        when p_status = 'canceled'::public.subscription_status then null
        when s.pending_plan <> p_plan then null
        when p_status = 'active'::public.subscription_status
          and p_current_period_end is not null
          and s.pending_plan_effective_at is not null
          and p_current_period_end > s.pending_plan_effective_at then null
        else s.pending_plan_effective_at
      end,
      pending_plan_requested_at = case
        when s.pending_plan is null then null
        when p_status = 'canceled'::public.subscription_status then null
        when s.pending_plan <> p_plan then null
        when p_status = 'active'::public.subscription_status
          and p_current_period_end is not null
          and s.pending_plan_effective_at is not null
          and p_current_period_end > s.pending_plan_effective_at then null
        else s.pending_plan_requested_at
      end,
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
