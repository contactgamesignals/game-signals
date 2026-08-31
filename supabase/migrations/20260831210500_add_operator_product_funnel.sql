-- Read-only product funnel snapshot for the private operator analytics page.
-- The function can only be executed with the server-side service role. It does
-- not expose customer email addresses, notification destinations, or billing
-- identifiers.
create or replace function public.operator_product_funnel_snapshot(
  p_since timestamptz default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with cohort_users as (
    select p.id as user_id
    from public.profiles p
    where p_since is null or p.created_at >= p_since
  ),
  user_stages as (
    select
      cu.user_id,
      exists (
        select 1
        from public.workspace_members wm
        join public.games g on g.workspace_id = wm.workspace_id
        where wm.user_id = cu.user_id
      ) as added_game,
      exists (
        select 1
        from private.trial_redemptions tr
        where tr.redeemed_by_user_id = cu.user_id
      ) as trial_redeemed,
      exists (
        select 1
        from public.workspace_members wm
        join public.notification_channels nc on nc.workspace_id = wm.workspace_id
        where wm.user_id = cu.user_id
          and nc.type = 'discord'
          and nc.enabled = true
      ) as discord_connected_current,
      exists (
        select 1
        from public.billing_checkout_consents bcc
        where bcc.user_id = cu.user_id
          and bcc.billing_provider = 'paddle'
          and bcc.billing_checkout_id is not null
      ) as checkout_started,
      exists (
        select 1
        from public.workspace_members wm
        join public.subscriptions s on s.workspace_id = wm.workspace_id
        where wm.user_id = cu.user_id
          and s.billing_provider = 'paddle'
          and s.billing_environment = 'live'
          and s.billing_subscription_id is not null
      ) as purchase_completed
    from cohort_users cu
  ),
  trial_attribution as (
    select
      tc.id as trial_code_id,
      tc.code,
      tc.label,
      tc.assigned_to,
      count(distinct tr.redeemed_by_user_id)::integer as redemptions,
      count(distinct tr.redeemed_by_user_id) filter (
        where exists (
          select 1
          from public.subscriptions s
          where s.workspace_id = tr.workspace_id
            and s.billing_provider = 'paddle'
            and s.billing_environment = 'live'
            and s.billing_subscription_id is not null
        )
      )::integer as purchases
    from private.trial_codes tc
    join private.trial_redemptions tr on tr.trial_code_id = tc.id
    join cohort_users cu on cu.user_id = tr.redeemed_by_user_id
    group by tc.id, tc.code, tc.label, tc.assigned_to
  )
  select jsonb_build_object(
    'cohort_since', p_since,
    'generated_at', now(),
    'signups', (select count(*)::integer from cohort_users),
    'added_game', (select count(*) filter (where added_game)::integer from user_stages),
    'trial_redeemed', (select count(*) filter (where trial_redeemed)::integer from user_stages),
    'discord_connected_current', (select count(*) filter (where discord_connected_current)::integer from user_stages),
    'checkout_started', (select count(*) filter (where checkout_started)::integer from user_stages),
    'purchase_completed', (select count(*) filter (where purchase_completed)::integer from user_stages),
    'trial_attribution', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'code', ta.code,
            'label', ta.label,
            'assigned_to', ta.assigned_to,
            'redemptions', ta.redemptions,
            'purchases', ta.purchases
          )
          order by ta.redemptions desc, ta.code
        )
        from trial_attribution ta
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all on function public.operator_product_funnel_snapshot(timestamptz) from public;
revoke all on function public.operator_product_funnel_snapshot(timestamptz) from anon;
revoke all on function public.operator_product_funnel_snapshot(timestamptz) from authenticated;
grant execute on function public.operator_product_funnel_snapshot(timestamptz) to service_role;
