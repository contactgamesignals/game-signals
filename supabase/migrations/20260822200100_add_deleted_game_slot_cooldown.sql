create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

grant usage on schema private to service_role;

create table private.game_slot_cooldowns (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_game_id uuid not null unique,
  source_game_title text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  constraint game_slot_cooldowns_expiry_check check (expires_at > created_at)
);

create index game_slot_cooldowns_workspace_expiry_idx
  on private.game_slot_cooldowns (workspace_id, expires_at);

revoke all on table private.game_slot_cooldowns from public, anon, authenticated;
grant select, insert, delete on table private.game_slot_cooldowns to service_role;

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
  if (select auth.uid()) is null or not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = (select auth.uid())
  ) then
    raise exception 'Not authorized for this workspace.' using errcode = '42501';
  end if;

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

revoke all on function public.workspace_game_slot_cooldown_state(uuid) from public, anon;
grant execute on function public.workspace_game_slot_cooldown_state(uuid) to authenticated;

create or replace function private.reserve_deleted_active_game_slot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not old.enabled then
    return old;
  end if;

  perform 1
  from public.workspaces
  where id = old.workspace_id
  for update;

  delete from private.game_slot_cooldowns
  where workspace_id = old.workspace_id
    and expires_at <= now();

  insert into private.game_slot_cooldowns (
    workspace_id,
    source_game_id,
    source_game_title,
    expires_at
  ) values (
    old.workspace_id,
    old.id,
    old.title,
    now() + interval '12 hours'
  )
  on conflict (source_game_id) do nothing;

  return old;
end;
$$;

revoke all on function private.reserve_deleted_active_game_slot() from public, anon, authenticated;

drop trigger if exists reserve_deleted_active_game_slot_before_delete on public.games;
create trigger reserve_deleted_active_game_slot_before_delete
before delete on public.games
for each row execute function private.reserve_deleted_active_game_slot();

create or replace function public.enforce_workspace_game_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan public.subscription_plan;
  current_count integer;
  cooldown_count integer;
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
         end
    into current_plan
  from public.workspaces w
  left join public.subscriptions s on s.workspace_id = w.id
  where w.id = new.workspace_id;

  if current_plan is null then
    current_plan := 'free'::public.subscription_plan;
  end if;

  allowed_count := public.game_limit_for_plan(current_plan);

  select count(*)::integer
    into current_count
  from public.games g
  where g.workspace_id = new.workspace_id
    and g.enabled = true
    and (tg_op = 'INSERT' or g.id <> new.id);

  select count(*)::integer
    into cooldown_count
  from private.game_slot_cooldowns c
  where c.workspace_id = new.workspace_id
    and c.expires_at > now();

  if current_count + cooldown_count >= allowed_count then
    if cooldown_count > 0 and current_count < allowed_count then
      raise exception 'GAME_SLOT_COOLDOWN'
        using errcode = 'P0001';
    end if;

    raise exception 'Active game limit reached for plan % (% games).', current_plan, allowed_count
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_workspace_game_limit() from public, anon, authenticated;
grant execute on function public.enforce_workspace_game_limit() to postgres, service_role;
