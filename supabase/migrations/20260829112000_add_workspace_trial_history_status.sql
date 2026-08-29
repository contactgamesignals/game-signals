-- Expose only the minimal promotional-trial history the authenticated workspace member
-- needs for honest dashboard messaging after a one-time invite trial expires.

create or replace function public.workspace_trial_history(p_workspace_id uuid)
returns table(
  redeemed_at timestamptz,
  ends_at timestamptz,
  has_paid_history boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_user_id
  ) then
    raise exception 'WORKSPACE_ACCESS_FORBIDDEN' using errcode = '42501';
  end if;

  return query
  select
    history.redeemed_at,
    history.ends_at,
    exists (
      select 1
      from public.subscriptions s
      where s.workspace_id = p_workspace_id
        and (
          s.billing_subscription_id is not null
          or s.stripe_subscription_id is not null
        )
    ) as has_paid_history
  from (
    select
      r.redeemed_at,
      r.ends_at
    from private.trial_redemptions r
    where r.workspace_id = p_workspace_id
    order by r.redeemed_at desc
    limit 1
  ) history

  union all

  select
    null::timestamptz,
    null::timestamptz,
    exists (
      select 1
      from public.subscriptions s
      where s.workspace_id = p_workspace_id
        and (
          s.billing_subscription_id is not null
          or s.stripe_subscription_id is not null
        )
    ) as has_paid_history
  where not exists (
    select 1
    from private.trial_redemptions r
    where r.workspace_id = p_workspace_id
  );
end;
$$;

revoke all on function public.workspace_trial_history(uuid) from public, anon, service_role;
grant execute on function public.workspace_trial_history(uuid) to authenticated;

comment on function public.workspace_trial_history(uuid) is
  'Returns minimal one-time promotional-trial history for an authenticated workspace member so the UI can distinguish unused, active, and expired invite trials.';
