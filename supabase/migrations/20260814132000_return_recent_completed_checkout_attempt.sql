-- Improve the completed-Checkout sync grace from the prior migration.
-- Instead of raising from Postgres, return the recent completed attempt so the
-- billing Edge Function can retrieve the Stripe Session and return its normal
-- controlled 'refresh billing' response. Still no second subscription can start.

create or replace function public.reserve_subscription_checkout(
  p_workspace_id uuid,
  p_user_id uuid,
  p_buyer_type public.billing_buyer_type,
  p_plan public.subscription_plan,
  p_billing_period text
)
returns table (
  attempt_id uuid,
  attempt_user_id uuid,
  attempt_buyer_type public.billing_buyer_type,
  attempt_plan public.subscription_plan,
  attempt_billing_period text,
  attempt_status text,
  stripe_checkout_session_id text,
  expires_at timestamptz,
  is_new boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_attempt public.billing_checkout_attempts%rowtype;
begin
  if p_workspace_id is null or p_user_id is null then
    raise exception 'workspace_id and user_id are required.' using errcode = 'P0001';
  end if;
  if p_plan is null or p_plan = 'free'::public.subscription_plan then
    raise exception 'A paid plan is required for Checkout.' using errcode = 'P0001';
  end if;
  if p_billing_period not in ('monthly', 'yearly') then
    raise exception 'Invalid billing period.' using errcode = 'P0001';
  end if;

  select s.*
    into v_subscription
  from public.subscriptions s
  where s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Subscription record not found.' using errcode = 'P0001';
  end if;

  if (
    v_subscription.stripe_subscription_id is not null
    and v_subscription.status <> 'canceled'::public.subscription_status
  ) or (
    v_subscription.plan <> 'free'::public.subscription_plan
    and v_subscription.status in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
  ) then
    raise exception 'This workspace already has a Stripe subscription. Use Manage billing.' using errcode = 'P0001';
  end if;

  update public.billing_checkout_attempts a
  set status = 'expired',
      updated_at = now()
  where a.workspace_id = p_workspace_id
    and a.status in ('creating', 'open')
    and a.expires_at <= now();

  select a.*
    into v_attempt
  from public.billing_checkout_attempts a
  where a.workspace_id = p_workspace_id
    and a.status in ('creating', 'open')
  order by a.created_at desc
  limit 1
  for update;

  if found then
    return query
      select v_attempt.id,
             v_attempt.user_id,
             v_attempt.buyer_type,
             v_attempt.plan,
             v_attempt.billing_period,
             v_attempt.status,
             v_attempt.stripe_checkout_session_id,
             v_attempt.expires_at,
             false;
    return;
  end if;

  select a.*
    into v_attempt
  from public.billing_checkout_attempts a
  where a.workspace_id = p_workspace_id
    and a.status = 'completed'
    and a.updated_at > now() - interval '15 minutes'
  order by a.updated_at desc
  limit 1
  for update;

  if found then
    return query
      select v_attempt.id,
             v_attempt.user_id,
             v_attempt.buyer_type,
             v_attempt.plan,
             v_attempt.billing_period,
             v_attempt.status,
             v_attempt.stripe_checkout_session_id,
             v_attempt.expires_at,
             false;
    return;
  end if;

  insert into public.billing_checkout_attempts (
    workspace_id,
    user_id,
    buyer_type,
    plan,
    billing_period,
    status,
    expires_at
  ) values (
    p_workspace_id,
    p_user_id,
    p_buyer_type,
    p_plan,
    p_billing_period,
    'creating',
    now() + interval '35 minutes'
  )
  returning * into v_attempt;

  return query
    select v_attempt.id,
           v_attempt.user_id,
           v_attempt.buyer_type,
           v_attempt.plan,
           v_attempt.billing_period,
           v_attempt.status,
           v_attempt.stripe_checkout_session_id,
           v_attempt.expires_at,
           true;
end;
$$;

revoke all on function public.reserve_subscription_checkout(
  uuid, uuid, public.billing_buyer_type, public.subscription_plan, text
) from public, anon, authenticated;

grant execute on function public.reserve_subscription_checkout(
  uuid, uuid, public.billing_buyer_type, public.subscription_plan, text
) to service_role;
