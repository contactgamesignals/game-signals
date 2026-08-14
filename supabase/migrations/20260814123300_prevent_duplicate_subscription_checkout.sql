-- Prevent concurrent Stripe Checkout attempts from creating duplicate subscriptions.
-- Additive only. The reservation is server-managed and serialized on subscriptions.workspace_id.

create table public.billing_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  buyer_type public.billing_buyer_type not null,
  plan public.subscription_plan not null check (plan <> 'free'::public.subscription_plan),
  billing_period text not null check (billing_period in ('monthly', 'yearly')),
  status text not null default 'creating' check (status in ('creating', 'open', 'completed', 'expired', 'failed')),
  stripe_checkout_session_id text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

-- At most one Checkout attempt may be capable of creating a subscription for a workspace.
create unique index billing_checkout_attempts_one_active_workspace_idx
  on public.billing_checkout_attempts(workspace_id)
  where status in ('creating', 'open');

create index billing_checkout_attempts_workspace_created_idx
  on public.billing_checkout_attempts(workspace_id, created_at desc);

create trigger billing_checkout_attempts_set_updated_at before update on public.billing_checkout_attempts
for each row execute function public.set_updated_at();

alter table public.billing_checkout_attempts enable row level security;

-- Checkout-attempt rows are internal billing state. Browser clients never need direct access.
revoke all on public.billing_checkout_attempts from anon, authenticated;
grant select, insert, update, delete on public.billing_checkout_attempts to service_role;

-- Link the existing immutable consent evidence to the attempt that created the Stripe Session.
alter table public.billing_checkout_consents
  add column if not exists checkout_attempt_id uuid references public.billing_checkout_attempts(id) on delete restrict;

create unique index if not exists billing_checkout_consents_attempt_unique_idx
  on public.billing_checkout_consents(checkout_attempt_id)
  where checkout_attempt_id is not null;

-- Service-role-only reservation primitive. SECURITY INVOKER is intentional: the Edge Function
-- already uses service_role and does not need a SECURITY DEFINER bypass.
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

  -- Serialize all attempts for the workspace on the existing one-row subscription record.
  select s.*
    into v_subscription
  from public.subscriptions s
  where s.workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception 'Subscription record not found.' using errcode = 'P0001';
  end if;

  -- Do not create a second subscription while an existing Stripe subscription can still recover
  -- or provide service. Fully canceled subscriptions may start a fresh Checkout.
  if (
    v_subscription.stripe_subscription_id is not null
    and v_subscription.status <> 'canceled'::public.subscription_status
  ) or (
    v_subscription.plan <> 'free'::public.subscription_plan
    and v_subscription.status in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
  ) then
    raise exception 'This workspace already has a Stripe subscription. Use Manage billing.' using errcode = 'P0001';
  end if;

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
