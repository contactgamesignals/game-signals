create or replace function public.workspace_game_slot_cooldown_state(p_workspace_id uuid)
returns table (
  active_games integer,
  cooldown_slots integer,
  allowed_slots integer,
  effective_used_slots integer,
  available_slots integer,
  next_slot_available_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  effective_plan public.subscription_plan;
  v_active_games integer;
  v_cooldown_slots integer;
  v_allowed_slots integer;
  needed_expirations integer;
  v_next_slot_available_at timestamptz;
begin
  select case
           when s.status in ('active'::public.subscription_status, 'trialing'::public.subscription_status)
             then coalesce(s.plan, 'free'::public.subscription_plan)
           else 'free'::public.subscription_plan
         end
    into effective_plan
  from public.workspaces w
  left join public.subscriptions s on s.workspace_id = w.id
  where w.id = p_workspace_id;

  if effective_plan is null then
    effective_plan := 'free'::public.subscription_plan;
  end if;

  v_allowed_slots := public.game_limit_for_plan(effective_plan);

  select count(*)::integer
    into v_active_games
  from public.games g
  where g.workspace_id = p_workspace_id
    and g.enabled = true;

  select count(*)::integer
    into v_cooldown_slots
  from private.game_slot_cooldowns c
  where c.workspace_id = p_workspace_id
    and c.expires_at > now();

  v_next_slot_available_at := null;
  if v_allowed_slots > 0
     and v_cooldown_slots > 0
     and v_active_games < v_allowed_slots
     and v_active_games + v_cooldown_slots >= v_allowed_slots then
    needed_expirations := v_active_games + v_cooldown_slots - v_allowed_slots + 1;

    if needed_expirations between 1 and v_cooldown_slots then
      select c.expires_at
        into v_next_slot_available_at
      from private.game_slot_cooldowns c
      where c.workspace_id = p_workspace_id
        and c.expires_at > now()
      order by c.expires_at asc, c.id asc
      offset (needed_expirations - 1)
      limit 1;
    end if;
  end if;

  return query
  select
    v_active_games,
    v_cooldown_slots,
    v_allowed_slots,
    v_active_games + v_cooldown_slots,
    greatest(v_allowed_slots - v_active_games - v_cooldown_slots, 0),
    v_next_slot_available_at;
end;
$$;

revoke all on function public.workspace_game_slot_cooldown_state(uuid) from public, anon, authenticated;
grant execute on function public.workspace_game_slot_cooldown_state(uuid) to service_role;
