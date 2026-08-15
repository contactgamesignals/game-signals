-- Harden Checkout reservation lifecycle without depending on webhook delivery timing.
-- 1) Attempts whose Stripe-aligned expires_at has passed are released before reserving.
-- 2) A just-completed Checkout gets a short sync grace period so a delayed subscription
--    webhook cannot allow a second subscription to be created for the same workspace.

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
  v_recent_completed boolean;
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

  -- Serialize all attempts for this workspace on its one-row subscription record.
  select s.*
    into v_subscription
  from public.subscriptions s
  where s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Subscription record not found.' using errcode = 'P0001';
  end if;

  -- Once Stripe has created a subscription, recovery/Portal owns its lifecycle until
  -- that subscription is fully canceled. Do not create a parallel subscription.
  if (
    v_subscription.stripe_subscription_id is not null
    and v_subscription.status <> 'canceled'::public.subscription_status
  ) or (
    v_subscription.plan <> 'free'::public.subscription_plan
    and v_subscription.status in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
  ) then
    raise exception 'This workspace already has a Stripe subscription. Use Manage billing.' using errcode = 'P0001';
  end if;

  -- The DB expiry is sent to Stripe as Checkout expires_at. Once it has passed, the
  -- Session can no longer be a valid purchase path and must not keep the reservation.
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

  -- A Checkout Session can become complete milliseconds before its subscription webhook
  -- is reflected locally. Keep a short fail-closed grace window instead of allowing a
  -- second subscription during that propagation gap.
  select exists (
    select 1
    from public.billing_checkout_attempts a
    where a.workspace_id = p_workspace_id
      and a.status = 'completed'
      and a.updated_at > now() - interval '15 minutes'
  ) into v_recent_completed;

  if v_recent_completed then
    raise exception 'A completed Checkout is still synchronizing. Refresh billing status before retrying.' using errcode = 'P0001';
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
